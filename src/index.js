// import { connect, createDataItemSigner } from "@permaweb/aoconnect/browser";
// import { createSigner } from "@permaweb/aoconnect"
import { createSigner } from "./signer/browser";
import { arGql } from "./argql";
import { toDataItemSigner, toANS104Request } from "./utils"


function assoc(k, v, o) {
    o[k] = v
    return o
}


export const GQLUrls = {
  goldsky: 'https://arweave-search.goldsky.com/graphql' ,
  arweave: 'https://arweave.net/graphql',
}

export const DEFAULT_HYPERBEAM_NODE_URL = "https://forward.computer"
export const DEFAULT_GQL_ENDPOINT = GQLUrls.goldsky


export class HB {
  constructor(params = {}) {
    const {url = DEFAULT_HYPERBEAM_NODE_URL, wallet, gql_url = DEFAULT_GQL_ENDPOINT} = params
    this.url = url || DEFAULT_HYPERBEAM_NODE_URL 
    this.wallet = wallet,
    this.gql_url = gql_url || DEFAULT_GQL_ENDPOINT
    this.authority = params?.authority
  }
  fetch = function (path, params) {
    let url =  this.url || DEFAULT_HYPERBEAM_NODE_URL
    return fetch(url + path, params)
  }
  getScheduler = async function() {
    let url =  this.url || DEFAULT_HYPERBEAM_NODE_URL
    let scheduler
    if (url === DEFAULT_HYPERBEAM_NODE_URL) {
      scheduler = 'https://scheduler.forward.computer'
    }else{
      scheduler = url
    }
    return await fetch(`${scheduler}/~meta@1.0/info/address`).then(res => res.text())
  }
  getAuthority = async function () {
    let url = this.url || DEFAULT_HYPERBEAM_NODE_URL
    let authority = this.authority

    // https://forward.computer/~meta@1.0/info/node_processes/router/trusted
    // or https://forward.computer/~meta@1.0/info/node_processes/router/trusted
    if (authority === "undefined" || authority === undefined) {
        if (url === 'https://forward.computer') {
            authority = "QWg43UIcJhkdZq6ourr1VbnkwcP762Lppd569bKWYKY"
        } else {
            authority = await this.fetch('/~meta@1.0/info/address')
                .then(r => r.text())
        }
        authority = authority + ',fcoN_xJeisVsPXA-trzVAuIiqO3ydLQxM-L4XbrQKzY'
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
      ]
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



      const {headers,item} = toANS104Request(params)
      const {id,raw} = await toDataItemSigner(createSigner(wallet || this.wallet))(item)

      const res = await this.fetch("/~process@1.0/push", {
        method: "POST",
        headers: headers,
        body: raw,
        redirect: 'follow'
      })
      if(res?.ok){
        return id
      }else{
        throw new Error("Spawn failed")
      }

      
    } catch (error) {
      throw error
    }
  }
  send = async function (target, fields, data, wallet) {
    try {
      if (!target) throw new Error("Missed target process")
      fields['Data-Protocol'] = "ao"
      fields.Variant = "ao.N.1"
      fields.signingFormat = fields.signingFormat || "ANS-104"
      fields.target = target
      fields.data = data

      const {headers,item} = toANS104Request(fields)
      const {id,raw} = await toDataItemSigner(createSigner(wallet || this.wallet))(item)
      
      let path = `/${target}~process@1.0/push`

      const res = await this.fetch(path, {
        method: "POST",
        headers: headers,
        body: raw,
        redirect: 'follow'
      })

      console.log(res)

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
        const body = await res.json()
        body.id = id
        return body
      }

    } catch (error) {
      throw error
    }
  }
  result = async function(fields = {},params) {
    try {
      const {process,message,slot} = fields
      if(!process) { throw new Error("missed process id.")}
      if(!message && !slot) { throw new Error("missed message or slot.")}
      let url = this.url || DEFAULT_HYPERBEAM_NODE_URL
      let path = `/${process}~process@1.0/compute=${slot || message}/results`

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
    const gql = arGql({endpointUrl: this.gql_url || GQLUrls.goldsky})
    let res = await gql.run(query||'');
    return res?.data?.transactions?.edges
  }
}