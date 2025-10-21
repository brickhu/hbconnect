import { Buffer } from 'buffer/index.js'
import * as WarpArBundles from "warp-arbundles";
import * as ArBundles from '@dha-team/arbundles'
const {DataItem} = WarpArBundles
import base64url from 'base64url'
// eslint-disable-next-line no-unused-vars
// import { Types } from '../../dal.js'
// import { DATAITEM_SIGNER_KIND, HTTP_SIGNER_KIND } from '../signer.js'

let DATAITEM_SIGNER_KIND = 'ans104'
let HTTP_SIGNER_KIND = 'httpsig'

if (!globalThis.Buffer) globalThis.Buffer = Buffer

export async function getRawAndId (dataItemBytes) {
  const dataItem = new DataItem(dataItemBytes)

  const rawSignature = dataItem.rawSignature
  const rawId = await crypto.subtle.digest('SHA-256', rawSignature)

  return {
    id: base64url.encode(Buffer.from(rawId)),
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
    })
    /**
     * https://github.com/wanderwallet/Wander?tab=readme-ov-file#signdataitemdataitem-promiserawdataitem
     */
    const view = await arweaveWallet.signDataItem({ data, tags, target, anchor })

    const res = await getRawAndId(Buffer.from(view))
    return res
  })

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
    ])
    return { publicKey, address }
  }).then(async ({ publicKey, address }) => {
    const signatureBase = await create({
      type: 1,
      publicKey,
      address,
      alg: 'rsa-pss-sha512'
    })

    const view = await arweaveWallet.signMessage(
      signatureBase,
      { hashAlgorithm: 'SHA-512' }
    )

    return {
      signature: Buffer.from(view),
      address
    }
  })

  return signer
}


export function createSigner (wallet) {
  const dataItemSigner = createANS104Signer(wallet)
  const httpSigner = createHttpSigner(wallet)

  const signer = (create, kind) => {
    // return dataItemSigner(create)
    if (kind === DATAITEM_SIGNER_KIND) return dataItemSigner(create)
    if (kind === HTTP_SIGNER_KIND) return httpSigner(create)
    throw new Error(`signer kind unknown "${kind}"`)
  }

  return signer
}

export const createDataItemSigner = createSigner