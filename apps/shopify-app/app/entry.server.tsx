// Mirrors Shopify's React Router app template: streams the document, and — when running as a
// real embedded app — adds the response headers Shopify requires (Content-Security-Policy
// frame-ancestors for the admin iframe, etc.) via `addDocumentResponseHeaders`.
import { PassThrough } from 'node:stream';
import { config } from '@aiart/core/config';
import { createReadableStreamFromReadable } from '@react-router/node';
import { isbot } from 'isbot';
import { renderToPipeableStream } from 'react-dom/server';
import { type EntryContext, ServerRouter } from 'react-router';

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  if (config('admin').AUTH_MODE === 'shopify') {
    const { addDocumentResponseHeaders } = await import('./shopify.server');
    addDocumentResponseHeaders(request, responseHeaders);
  }

  const userAgent = request.headers.get('user-agent');
  const callbackName = isbot(userAgent ?? '') ? 'onAllReady' : 'onShellReady';

  return new Promise<Response>((resolve, reject) => {
    let status = responseStatusCode;
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set('Content-Type', 'text/html');
          resolve(new Response(stream, { headers: responseHeaders, status }));
          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          status = 500;
          console.error(error);
        },
      },
    );
    setTimeout(abort, streamTimeout + 1000);
  });
}
