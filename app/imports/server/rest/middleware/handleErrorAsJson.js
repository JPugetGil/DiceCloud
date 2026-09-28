/**
 * Handle any connect errors with a standard JSON response
 *
 * Response looks like:
 *   {
 *     error: 'Error type',
 *     reason: 'Cause of error'
 *   }
 *
 * Ported from simple:rest-json-error-handler, which has no Meteor 3 release.
 * It used to install itself onto a global RestMiddleware object; this is the
 * same handler as a plain export instead.
 *
 * @middleware
 */
// connect picks error handlers by arity, so the unused `next` has to stay
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function handleErrorAsJson(err, request, response, next) {
  // If we at least put in some effort to throw a user-facing Meteor.Error,
  // the default code should be less severe
  if (err.sanitizedError && err.sanitizedError.errorType === 'Meteor.Error') {
    if (!err.sanitizedError.statusCode) {
      err.sanitizedError.statusCode = err.statusCode || 400;
    }

    err = err.sanitizedError;
  } else if (err.errorType === 'Meteor.Error') {
    if (!err.statusCode) err.statusCode = 400;
  } else {
    // Hide internal error details
    const statusCode = err.statusCode;
    err = new Error();
    err.statusCode = statusCode;
  }

  // If an error has a `data` property, we send that. This allows packages to
  // include extra client-safe data with the errors they throw.
  const body = JSON.stringify({
    error: err.error || 'internal-server-error',
    reason: err.reason || 'Internal server error',
    details: err.details,
    data: err.data,
  }, null, 2);

  response.statusCode = err.statusCode || 500;
  response.setHeader('Content-Type', 'application/json');
  response.write(body);
  response.end();
}
