/**
 * Parses bearer token from the incoming request
 *
 * Accepts tokens passed via the standard headers or URL query parameters
 * (whichever is found first, in that order).
 *
 * Stores the token in req.authToken for later middleware.
 *
 * The header signature is: "Authorization: Bearer <token>".
 *
 * The query signature is: "?access_token=<token>"
 *
 * Ported from simple:rest-bearer-token-parser, which has no Meteor 3 release.
 * It used to install itself onto JsonRoutes.Middleware; this is the same
 * middleware as a plain export instead.
 *
 * @middleware
 */
export default function parseBearerToken(req, res, next) {
  req.authToken = parseHeaders(req) || parseQuery(req);
  next();
}

/**
 * Parses bearer token from the Authorization header
 *
 * @param req {Object} The incoming Connect request
 * @returns {String} The bearer token
 * @private
 */
function parseHeaders(req) {
  if (req.headers && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');

    if (parts.length === 2) {
      const scheme = parts[0];
      const credentials = parts[1];

      if (/^Bearer$/i.test(scheme)) {
        return credentials;
      }
    }
  }
}

/**
 * Parses bearer token from URL query parameters
 *
 * @param req {Object} The incoming Connect request
 * @returns {String} The bearer token
 * @private
 */
function parseQuery(req) {
  if (req.query && req.query.access_token) {
    return req.query.access_token;
  }
}
