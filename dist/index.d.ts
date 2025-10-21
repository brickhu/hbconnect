import { Buffer } from 'buffer/index.js';
import * as ArBundles from '@dha-team/arbundles';
import base64url$1 from 'base64url';
import { keys, omit } from 'ramda';

const {DataItem} = ArBundles;
// eslint-disable-next-line no-unused-vars
// import { Types } from '../../dal.js'
// import { DATAITEM_SIGNER_KIND, HTTP_SIGNER_KIND } from '../signer.js'

let DATAITEM_SIGNER_KIND = 'ans104';
let HTTP_SIGNER_KIND = 'httpsig';

if (!globalThis.Buffer) globalThis.Buffer = Buffer;

async function getRawAndId (dataItemBytes) {
  const dataItem = new DataItem(dataItemBytes);

  const rawSignature = dataItem.rawSignature;
  const rawId = await crypto.subtle.digest('SHA-256', rawSignature);

  return {
    id: base64url$1.encode(Buffer.from(rawId)),
    raw: dataItem.getRaw()
  }
}

function createANS104Signer (arweaveWallet) {

  const signer = async (create) => arweaveWallet.connect([
    'SIGN_TRANSACTION'
  ]).then(async () => {

    const { data, tags, target, anchor } = await create({
      alg: 'rsa-v1_5-sha256',
      passthrough: true
    });
    /**
     * https://github.com/wanderwallet/Wander?tab=readme-ov-file#signdataitemdataitem-promiserawdataitem
     */
    const view = await arweaveWallet.signDataItem({ data, tags, target, anchor });

    const res = await getRawAndId(Buffer.from(view));
    return res
  });

  return signer
}

function createHttpSigner (arweaveWallet) {
  const signer = async (create) => arweaveWallet.connect([
    'ACCESS_ADDRESS',
    'ACCESS_PUBLIC_KEY',
    'SIGNATURE'
  ]).then(async () => {
    const [publicKey, address] = await Promise.all([
      arweaveWallet.getActivePublicKey(),
      arweaveWallet.getActiveAddress()
    ]);
    return { publicKey, address }
  }).then(async ({ publicKey, address }) => {
    const signatureBase = await create({
      type: 1,
      publicKey,
      address,
      alg: 'rsa-pss-sha512'
    });

    const view = await arweaveWallet.signMessage(
      signatureBase,
      { hashAlgorithm: 'SHA-512' }
    );

    return {
      signature: Buffer.from(view),
      address
    }
  });

  return signer
}


function createSigner (wallet) {
  const dataItemSigner = createANS104Signer(wallet);
  const httpSigner = createHttpSigner(wallet);

  const signer = (create, kind) => {
    // return dataItemSigner(create)
    if (kind === DATAITEM_SIGNER_KIND) return dataItemSigner(create)
    if (kind === HTTP_SIGNER_KIND) return httpSigner(create)
    throw new Error(`signer kind unknown "${kind}"`)
  };

  return signer
}

const fetchRetry = async (
	input,
	init,
	opts
) => {
	const { retry, retryMs } = opts;
	let tries = 0;
	while (true) {
		try {
			return await fetch(input, init);
		} catch (e) {
			if (tries++ < retry) {
				console.warn(`[ar-gql] waiting ${retryMs}ms before retrying ${tries} of ${retry}`);
				await new Promise((resolve) => setTimeout(resolve, retryMs));
				continue
			}
			throw new TypeError(`Failed to fetch from ${input} after ${retry} retries`, { cause: e })
		}
	}
};

function arGql(options){
  const defaultOpts = {
    endpointUrl: 'https://arweave-search.goldsky.com/graphql',
    retries: 0,
    retryMs: 10_000,
  };
  const opts = { ...defaultOpts, ...options };
  //sanity check
  if (!opts.endpointUrl.match(/^https?:\/\/.*\/graphql*/)) {
    throw new Error(`string doesn't appear to be a URL of the form <http(s)://some-domain/graphql>'. You entered "${opts.endpointUrl}"`)
  }

  const run = async (
    query,
    variables
  ) => {
    const graphql = JSON.stringify({
      query,
      variables,
    });

    const res = await fetchRetry(
      opts.endpointUrl,
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: graphql,
      },
      {
        retry: opts.retries,
        retryMs: opts.retryMs,
      }
    );

    if (!res.ok) {
      throw new Error(res.statusText, { cause: res.status })
    }

    return await res.json();
  };

 

  return {
    run
  }
}

const toDataItemSigner = (signer) => {

  const DATAITEM_SIGNER_KIND = 'ans104';
  return async ({ data, tags, target, anchor }) => {
    let resolveUnsigned;
    let createCalled;
    /**
     * @type {Promise<Buffer>}
     */
    const dataToSign = new Promise((resolve) => { resolveUnsigned = resolve; });

    /**
     * receive the signing public credentials and
     * extract what we need to construct the unsigned
     * data item
     */
    const create = async (injected) => {
      createCalled = true;
      /**
       * If the signer wishes to receive the arguments
       * and skip serialization to a data item, they can provide this argument.
       *
       * This is useful for signers that internally serialize data items,
       * and drive UI off of the provided inputs ie. ArConnect
       */
      if (injected.passthrough) return { data, tags, target, anchor }

      /**
       * Default the type and alg to be
       * - type: arweave
       * - alg: RSA PSS SHA256 (default for arweave signing)
       */
      // eslint-disable-next-line no-unused-vars
      const { publicKey, type = 1, alg = 'rsa-v1_5-sha256' } = injected;

      const unsigned = createDataItemBytes(
        data,
        { type, publicKey: toView(publicKey) },
        { target, tags, anchor }
      );

      /**
       * What is actually signed is the DataItem
       * deephash, so stash the unsigned bytes,
       * and resolve the deepHash.
       *
       * When the signature is ultimately received,
       * we can add it to the unsigned bytes
       */
      resolveUnsigned(unsigned);
      const deepHash = await getSignatureData(unsigned);
      return deepHash
    };

    return signer(create, DATAITEM_SIGNER_KIND)
      .then((res) => {
        /**
         * Ensure create was called in order to produce the signature
         */
        if (!createCalled) {
          throw new Error('create() must be invoked in order to construct the data to sign')
        }

        /**
         * The signer has done the work
         */
        if (typeof res === 'object' && res.id && res.raw) return res

        if (!res.signature || !res.signature) {
          throw new Error('signer must return its signature and address')
        }
        const { signature } = res;
        return dataToSign.then((unsigned) => {
          return Promise.resolve(signature)
            .then(toView)
            .then(async (rawSig) => {
              /**
               * Add signature to the data item in the proper
               * position: after the first 2 bytes reserved for signature type
               */
              const signedBytes = unsigned;
              signedBytes.set(rawSig, 2);

              const isValid = await verify(signedBytes);
              if (!isValid) throw new Error('Data Item signature is not valid')

              return {
                /**
                 * A data item's ID is the base64url encoded
                 * SHA-256 of the signature
                 */
                id: await crypto.subtle.digest('SHA-256', rawSig)
                  .then(raw => base64url.encode(raw)),
                raw: signedBytes
              }
            })
        })
      })
  }
};

function toANS104Request(fields) {
  const dataItem = {
    target: fields.target,
    anchor: fields.anchor ?? '',
    tags: keys(
      omit(
        [
          'Target',
          'target',
          'Anchor',
          'anchor',
          'Data',
          'data',
          'data-protocol',
          'Data-Protocol',
          'variant',
          'Variant',
          'dryrun',
          'Dryrun',
          'Type',
          'type',
          'path',
          'method',
          'signingFormat',
          'signing-format'
        ],
        fields
      )
    )
      .map(function (key) {
        return { name: key, value: fields[key] }
      }, fields)
      .concat([
        { name: 'data-protocol', value: 'ao' },
        { name: 'type', value: fields.type ?? 'Message' },
        { name: 'variant', value: fields.variant ?? 'ao.N.1' }
      ]),
    data: fields?.data || ''
  };
  return {
    headers: {
      'Content-Type': 'application/ans104',
      'codec-device': 'ans104@1.0',
      'accept-bundle': 'true'
    }, item: dataItem
  }
}

// import { connect, createDataItemSigner } from "@permaweb/aoconnect/browser";
// import { createSigner } from "@permaweb/aoconnect"


function assoc(k, v, o) {
    o[k] = v;
    return o
}


const GQLUrls = {
  goldsky: 'https://arweave-search.goldsky.com/graphql' ,
  arweave: 'https://arweave.net/graphql',
};

const DEFAULT_HYPERBEAM_NODE_URL = "https://forward.computer";
const DEFAULT_GQL_ENDPOINT = GQLUrls.goldsky;


class HB {
  constructor(params = {}) {
    const {url = DEFAULT_HYPERBEAM_NODE_URL, wallet, gql_url = DEFAULT_GQL_ENDPOINT} = params;
    this.url = url || DEFAULT_HYPERBEAM_NODE_URL; 
    this.wallet = wallet,
    this.gql_url = gql_url || DEFAULT_GQL_ENDPOINT;
    this.authority = params?.authority;
  }
  fetch = function (path, params) {
    let url =  this.url || DEFAULT_HYPERBEAM_NODE_URL;
    return fetch(url + path, params)
  }
  getScheduler = async function() {
    let url =  this.url || DEFAULT_HYPERBEAM_NODE_URL;
    let scheduler;
    if (url === DEFAULT_HYPERBEAM_NODE_URL) {
      scheduler = 'https://scheduler.forward.computer';
    }else {
      scheduler = url;
    }
    return await fetch(`${scheduler}/~meta@1.0/info/address`).then(res => res.text())
  }
  getAuthority = async function () {
    let url = this.url || DEFAULT_HYPERBEAM_NODE_URL;
    let authority = this.authority;

    // https://forward.computer/~meta@1.0/info/node_processes/router/trusted
    // or https://forward.computer/~meta@1.0/info/node_processes/router/trusted
    if (authority === "undefined" || authority === undefined) {
        if (url === 'https://forward.computer') {
            authority = "QWg43UIcJhkdZq6ourr1VbnkwcP762Lppd569bKWYKY";
        } else {
            authority = await this.fetch('/~meta@1.0/info/address')
                .then(r => r.text());
        }
        authority = authority + ',fcoN_xJeisVsPXA-trzVAuIiqO3ydLQxM-L4XbrQKzY';
    }
    console.log(`Authority: ${authority}`);
    return authority
}
  spawn = async function(name,data,wallet) {
    try {
      if(!wallet&&!this.wallet) throw new Error("missed wallet")
      let scheduler = await this.getScheduler();
      let tags = [
          { name: 'App-Name', value: 'hyper-aos' },
          { name: 'Name', value: name },
          { name: 'Authority', value: await this.getAuthority() },
      ];
      let params = {
        path: '/push',
        method: 'POST',
        type: 'Process',
        device: 'process@1.0',
        "data-protocol": "ao",
        'scheduler-device': 'scheduler@1.0',
        'push-device': 'push@1.0',
        'execution-device': 'lua@5.3a',
        // "bundle": "false",
        // "commitment-device": "ans104@1.0",
        // "app-name": "hyper-aos",
        variant: 'ao.N.1',
        ...tags.reduce((a, t) => assoc(t.name, t.value, a), {}),
        'aos-version': '2.0.7', // from aos-cli pkg.version
        'accept-bundle': 'true', // note: added to header automatically
        'codec-device': 'ans104@1.0',
        'signingformat': 'ANS-104',
        'scheduler': scheduler,
        'scheduler-location': scheduler,
        'Module': 'xVcnPK8MPmcocS6zwq1eLmM2KhfyarP8zzmz3UVi1g4', // from aos-cli pkg.hyper.module
        "data" : data
      };



      const {headers,item} = toANS104Request(params);
      const {id,raw} = await toDataItemSigner(createSigner(wallet || this.wallet))(item);

      const res = await this.fetch("/~process@1.0/push", {
        method: "POST",
        headers: headers,
        body: raw,
        redirect: 'follow'
      });
      if(res?.ok){
        return id
      }else {
        throw new Error("Spawn failed")
      }

      
    } catch (error) {
      throw error
    }
  }
  send = async function (target, fields, data, wallet) {
    try {
      if (!target) throw new Error("Missed target process")
      fields['Data-Protocol'] = "ao";
      fields.Variant = "ao.N.1";
      fields.signingFormat = fields.signingFormat || "ANS-104";
      fields.target = target;
      fields.data = data;

      const {headers,item} = toANS104Request(fields);
      const {id,raw} = await toDataItemSigner(createSigner(wallet || this.wallet))(item);
      
      let path = `/${target}~process@1.0/push?accept=application/json&accept-bundle=true`;

      const res = await this.fetch(path, {
        method: "POST",
        headers: headers,
        body: raw,
        redirect: 'follow'
      });

      console.log(res);

      // if (res.status === 422 && signingFormat === 'HTTP') {
      //   // Try again with different signing format
      //   reqFormatCache[fields.path] = 'ANS-104'
      //   return requestWith({ ...args, signingFormat: 'ANS-104' })(fields)
      // }

      if (res.status == 500) {
        throw new Error(`${res.status}: ${await res.text()}`)
      }

      if (res.status === 404) {
        throw new Error(`${res.status}: ${await res.text()}`)
      }

      if (res.status >= 400) {
        throw new Error(`${res.status}: ${await res.text()}`)
      }

      if (res.status >= 300) {
        return res
      }

      if (res.status == 200) {
        return res.json()
      }

    } catch (error) {
      throw error
    }
  }
  result = async function(fields = {},params) {
    try {
      const {process,message,slot} = fields;
      if(!process) { throw new Error("missed process id.")}
      if(!message && !slot) { throw new Error("missed message or slot.")}
      let url = this.url || DEFAULT_HYPERBEAM_NODE_URL;
      let path = `/${process}~process@1.0/compute=${slot || message}/results`;

      return this.fetch(path, {
          method : "GET",
          headers : params?.headers || {
            "Accept": "application/json",
            "Accept-bundle" : "true"
          }
      }).then(res => res?.ok && res?.json())
      
    } catch (error) {
      throw error
    }
    
  }
  query = async function(query,options) {
    const gql = arGql({endpointUrl: this.gql_url || GQLUrls.goldsky});
    let res = await gql.run(query||'');
    return res?.data?.transactions?.edges
  }
}

export { DEFAULT_GQL_ENDPOINT, DEFAULT_HYPERBEAM_NODE_URL, GQLUrls, HB };
