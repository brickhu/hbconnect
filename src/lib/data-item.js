import { Buffer } from 'buffer/index.js'
import base64url from 'base64url'
import * as WarpArBundles from "warp-arbundles";
import * as ArBundles from '@dha-team/arbundles'

if (!globalThis.Buffer) globalThis.Buffer = BufferShim

const { DataItem } = WarpArBundles;

// const pkg = ArBundles.default ? ArBundles.default : ArBundles
// const { createData, DataItem, SIG_CONFIG } = pkg


// export function createDataItemBytes (data, signer, opts) {

//   const signerMeta = SIG_CONFIG[signer.type]
//   if (!signerMeta) throw new Error(`Metadata for signature type ${signer.type} not found`)
//   signerMeta.signatureType = signer.type
//   signerMeta.ownerLength = signerMeta.pubLength
//   signerMeta.signatureLength = signerMeta.sigLength
//   signerMeta.publicKey = signer.publicKey

//   const dataItem = createData(data, signerMeta, opts)
//   return dataItem.getRaw()
// }

export async function getRawAndId (dataItemBytes) {
  const dataItem = new DataItem(dataItemBytes)

  const rawSignature = dataItem.rawSignature
  const rawId = await crypto.subtle.digest('SHA-256', rawSignature)

  return {
    id: base64url.encode(Buffer.from(rawId)),
    raw: dataItem.getRaw()
  }
}

// export function getSignatureData (dataItemBytes) {
//   const dataItem = new DataItem(dataItemBytes)
//   return dataItem.getSignatureData()
// }

// export function verify (dataItemBytes) {
//   return DataItem.verify(dataItemBytes)
// }