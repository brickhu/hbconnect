
const fetchRetry = async (
	input,
	init,
	opts
) => {
	const { retry, retryMs } = opts
	let tries = 0;
	while (true) {
		try {
			return await fetch(input, init);
		} catch (e) {
			if (tries++ < retry) {
				console.warn(`[ar-gql] waiting ${retryMs}ms before retrying ${tries} of ${retry}`)
				await new Promise((resolve) => setTimeout(resolve, retryMs))
				continue
			}
			throw new TypeError(`Failed to fetch from ${input} after ${retry} retries`, { cause: e })
		}
	}
}

export function arGql(options){
  const defaultOpts = {
    endpointUrl: 'https://arweave-search.goldsky.com/graphql',
    retries: 0,
    retryMs: 10_000,
  }
  const opts = { ...defaultOpts, ...options }
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

/** some useful constants */
export const GQLUrls = {
  goldsky: 'https://arweave-search.goldsky.com/graphql' ,
  arweave: 'https://arweave.net/graphql',
}