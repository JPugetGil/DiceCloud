/**
 * The address of the client behind an HTTP request, as ddp-server reads a
 * connection's (`clientAddress`): with HTTP_FORWARDED_COUNT proxies in front
 * (1 behind the Cloudflare tunnel of deploy/), that many entries from the end
 * of X-Forwarded-For; without, the socket's. Null when the header has fewer
 * entries than proxies, as ddp-server does.
 * @param {import('http').IncomingMessage} request
 * @returns {string | null}
 */
export default function requestClientAddress(request) {
  const forwardedCount = parseInt(process.env.HTTP_FORWARDED_COUNT || '', 10) || 0;
  if (forwardedCount === 0) return request.socket?.remoteAddress ?? null;
  const header = request.headers['x-forwarded-for'];
  if (typeof header !== 'string') return null;
  const forwardedFor = header.trim().split(/\s*,\s*/);
  if (forwardedCount < 0 || forwardedCount > forwardedFor.length) return null;
  return forwardedFor[forwardedFor.length - forwardedCount];
}
