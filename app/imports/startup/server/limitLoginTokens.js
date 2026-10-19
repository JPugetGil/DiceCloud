import { Accounts } from 'meteor/accounts-base';

const MAX_LOGIN_TOKENS = 20;

Accounts._insertHashedLoginToken = async function(userId, hashedToken, query) {
  // Accounts passes a selector object, or nothing
  /** @type {Record<string, any>} */
  const selector = { .../** @type {Record<string, any> | undefined} */ (query), _id: userId };
  const user = await Accounts.users.findOneAsync(selector);
  let loginTokenLength = user?.services?.resume?.loginTokens?.length;
  while (loginTokenLength >= MAX_LOGIN_TOKENS){
    loginTokenLength -=1;
    await Accounts.users.updateAsync(selector, {
      $pop: {
        'services.resume.loginTokens': -1
      }
    });
  }
  await Accounts.users.updateAsync(selector, {
    $addToSet: {
      'services.resume.loginTokens': hashedToken
    }
  });
};
