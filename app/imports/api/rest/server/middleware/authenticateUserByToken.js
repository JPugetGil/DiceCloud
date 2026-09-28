import handleErrorAsJson from './handleErrorAsJson';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';

/**
 * Middleware for validating a Meteor.user's login token
 *
 * This middleware must be processed after the request.token has been set to a
 * valid login token for a Meteor.user account (from a separate layer of
 * middleware). If authentication is successful, the request.userId will be set
 * to the ID of the authenticated user. An invalid token will result in a error.
 *
 * The user lookup is asynchronous: the middleware resolves through the
 * returned promise.
 *
 * @middleware
 */
const authenticateMeteorUserByToken =
  async function (req, res, next) {
    let userId;
    try {
      userId = await getUserIdFromAuthToken(req.authToken);
    } catch (error) {
      handleErrorAsJson(error, req, res, next);
      return;
    }
    if (userId) {
      req.userId = userId;
    }

    next();
  };

/**
 * Retrieves the ID of the Meteor.user that the given auth token belongs to
 *
 * @param token An unhashed auth token
 * @returns {Promise<String>} The ID of the authenticated Meteor.user, or null
 *     if token is invalid
 */
async function getUserIdFromAuthToken(token) {
  if (!token) {
    return null;
  }

  const user = await Meteor.users.findOneAsync({
    'services.resume.loginTokens.hashedToken': Accounts._hashLoginToken(token),
  });
  if (user) {
    return user._id;
  } else {
    const error = new Meteor.Error('Permission denied',
    'Invalid authentication token');
    error.statusCode = 403;
    throw error;
  }
}

export default authenticateMeteorUserByToken;
