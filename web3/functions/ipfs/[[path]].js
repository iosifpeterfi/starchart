// Cloudflare Pages Function — proxies IPFS API requests to ipfs.ethernity.cloud
// to avoid CORS issues from the browser.
const UPSTREAM = 'https://ipfs.ethernity.cloud';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const ipfsPath = '/' + context.params.path.join('/');
  const upstream = UPSTREAM + ipfsPath + url.search;

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const resp = await fetch(upstream, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== 'GET' ? context.request.body : undefined,
  });

  const response = new Response(resp.body, {
    status: resp.status,
    headers: resp.headers,
  });
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
}
