import { createSigner } from "@permaweb/aoconnect";
import { arGql } from "./argql";
import { toDataItemSigner, toANS104Request } from "./utils"

export const GQLUrls = {
  goldsky: 'https://arweave-search.goldsky.com/graphql' ,
  arweave: 'https://arweave.net/graphql',
}

export const DEFAULT_HYPERBEAM_NODE_URL = "https://workshop.forward.computer"
export const DEFAULT_GQL_ENDPOINT = GQLUrls.goldsky


export class HB {
  constructor(params = {}) {
    const {url = DEFAULT_HYPERBEAM_NODE_URL, wallet, gql_url = DEFAULT_GQL_ENDPOINT} = params
    this.url = url || DEFAULT_HYPERBEAM_NODE_URL || import.meta.env.VITE_HYPERBEAM_URL
    this.wallet = wallet,
    this.gql_url = gql_url || DEFAULT_GQL_ENDPOINT
  }
  fetch = function (path, params) {
    return fetch(this.url + path, params).then(res => res?.ok && res?.json())
  }
  send = async function (fields, wallet) {
    try {
      let { target } = fields
      if (!target) throw new Error("Missed target process")
      let signer = createSigner(wallet || this.wallet)
      if (!signer) throw new Error("Missed singer")

      fields['Data-Protocol'] = "ao"
      fields.Variant = "ao.N.1"
      fields.signingFormat = fields.signingFormat || "ANS-104"

      const ans104Request = toANS104Request(fields)
      const signedRequest = await toDataItemSigner(signer)(ans104Request.item)

      let url = this.url
      let path = `/${target}~process@1.0/push/serialize~json@1.0`
      let fetch_req = {
        body: signedRequest.raw,
        url: url + path,
        path,
        method: "POST",
        headers: ans104Request.headers
      }
      const res = await fetch(fetch_req.url, {
        method: fetch_req.method,
        headers: fetch_req.headers,
        body: fetch_req.body,
        redirect: 'follow'
      })

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

      const body = await res.json()

      return {
        id: signedRequest?.id,
        ...body
      }

    } catch (error) {
      throw error
    }
  }
  result = async function(fields = {},params) {
    try {
      const {process,message,slot} = fields
      if(!process) { throw new Error("missed process id.")}
      if(message || slot){
        let path = ``
        if(message){
          path = `/${process}~process@1.0/compute&id=${message}/results/serialize~json@1.0`
        }
        if(slot){
          path = `/${process}~process@1.0/compute&slot=${slot}/results/serialize~json@1.0`
        }
        return fetch(this.url + path, params).then(res => res?.ok && res?.json())
      }else{
        throw new Error("missed message id or slot.")
      }
      
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