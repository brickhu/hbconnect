import { omit, keys } from 'ramda'

export const toDataItemSigner = (signer) => {

  const DATAITEM_SIGNER_KIND = 'ans104'
  const HTTP_SIGNER_KIND = 'httpsig'
  return async ({ data, tags, target, anchor }) => {
    let resolveUnsigned
    let createCalled
    /**
     * @type {Promise<Buffer>}
     */
    const dataToSign = new Promise((resolve) => { resolveUnsigned = resolve })

    /**
     * receive the signing public credentials and
     * extract what we need to construct the unsigned
     * data item
     */
    const create = async (injected) => {
      createCalled = true
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
      const { publicKey, type = 1, alg = 'rsa-v1_5-sha256' } = injected

      const unsigned = createDataItemBytes(
        data,
        { type, publicKey: toView(publicKey) },
        { target, tags, anchor }
      )

      /**
       * What is actually signed is the DataItem
       * deephash, so stash the unsigned bytes,
       * and resolve the deepHash.
       *
       * When the signature is ultimately received,
       * we can add it to the unsigned bytes
       */
      resolveUnsigned(unsigned)
      const deepHash = await getSignatureData(unsigned)
      return deepHash
    }

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
        const { signature } = res
        return dataToSign.then((unsigned) => {
          return Promise.resolve(signature)
            .then(toView)
            .then(async (rawSig) => {
              /**
               * Add signature to the data item in the proper
               * position: after the first 2 bytes reserved for signature type
               */
              const signedBytes = unsigned
              signedBytes.set(rawSig, 2)

              const isValid = await verify(signedBytes)
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
}

export function toANS104Request(fields) {
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
  }
  return {
    headers: {
      'Content-Type': 'application/ans104',
      'codec-device': 'ans104@1.0',
      'accept-bundle': 'true'
    }, item: dataItem
  }
}