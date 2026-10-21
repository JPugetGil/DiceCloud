import { JsonRoutes } from 'meteor/simple:json-routes';
import authenticateMeteorUserByToken from './middleware/authenticateUserByToken';
import parseBearerToken from './middleware/parseBearerToken';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';
import { Meteor } from 'meteor/meteor';
import { RateLimiter } from 'meteor/rate-limit';
import requestClientAddress from '/imports/api/rest/server/requestClientAddress';

/**
 * Login with username/email and password:
 *   POST /api/login
 *   Body: {"username": "<your username>", "password": "<your password>"}
 *   Alternative Body: {"email": "<your email>", "password": "<your password>"}
 * Successful response:
 *   {
 *     "id": "<your userId>",
 *     "token": "<your user token, save this>",
 *     "tokenExpires": "<date string of token expiry date>"
 *   }
 *
 * Warning: Your token may expire before the given date.
 * Since each user has a limited pool of login tokens. If you get a permission
 * error, you may need to login again to refresh your token
 *
 * Once you have your token, you can use it as a standard bearer token header
 * in other API endpoints:
 *   fetch('/api/creature/<creature id>', {
 *     headers: { Authorization: 'Bearer <token>' },
 *   });
**/

JsonRoutes.Middleware.use(parseBearerToken);
JsonRoutes.Middleware.use(authenticateMeteorUserByToken);

JsonRoutes.add('options', 'api/login', function (req, res) {
  JsonRoutes.sendResult(res);
});

// The DDP rate limits do not reach this route: Accounts' own login rule (5
// attempts per 10 s from an address), and per account against attempts
// spread over many addresses
const loginLimiter = new RateLimiter();
loginLimiter.addRule({ type: 'restLogin', clientAddress: () => true }, 5, 10_000);
loginLimiter.addRule({ type: 'restLogin', account: () => true }, 10, 600_000);

// One answer for an unknown account and a wrong password, as Accounts gives:
// nothing to learn which accounts exist from
const wrongCredentials = () => new Meteor.Error(403, 'Something went wrong. Please check your credentials.');

// The accounts lookups and the password check are asynchronous: awaited, a
// failed login answers with a clean auth error rather than a generic 500.
JsonRoutes.add('post', 'api/login', async function (req, res) {
  var options = req.body;

  // The account named, by its email or its username
  let email, username;
  if (options.email) {
    check(options, {
      email: String,
      password: String,
    });
    email = options.email;
  } else {
    check(options, {
      username: String,
      password: String,
    });
    username = options.username;
  }

  const attempt = {
    type: 'restLogin',
    clientAddress: requestClientAddress(req),
    account: (email ?? username ?? '').toLowerCase(),
  };
  const limit = loginLimiter.check(attempt);
  if (!limit.allowed) {
    const error = new Meteor.Error('too-many-requests',
      `Too many login attempts. Please wait ${Math.ceil(limit.timeToReset / 1000)} seconds.`);
    // @ts-expect-error The JSON error handler answers with it
    error.statusCode = 429;
    throw error;
  }
  loginLimiter.increment(attempt);

  var user = email
    ? await Accounts.findUserByEmail(email)
    : await Accounts.findUserByUsername(username ?? '');
  if (!user) throw wrongCredentials();

  var result = await Accounts._checkPasswordAsync(user, options.password);
  check(result, {
    userId: String,
    error: Match.Optional(Meteor.Error),
  });

  if (result.error) throw wrongCredentials();

  var stampedLoginToken = Accounts._generateStampedLoginToken();
  check(stampedLoginToken, {
    token: String,
    when: Date,
  });

  await Accounts._insertLoginToken(result.userId, stampedLoginToken);

  var tokenExpiration = Accounts._tokenExpiration(stampedLoginToken.when);
  check(tokenExpiration, Date);

  JsonRoutes.sendResult(res, {
    data: {
      id: result.userId,
      token: stampedLoginToken.token,
      tokenExpires: tokenExpiration,
    },
  });

});
