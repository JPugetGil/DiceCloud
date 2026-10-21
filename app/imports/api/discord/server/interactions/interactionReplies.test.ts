import { assert } from 'chai';
import { Meteor } from 'meteor/meteor';
import { failureMessage } from '/imports/api/discord/server/interactions/interactionReplies';

/*
 * A command's failure, which may be answered in public: a Meteor.Error's
 * reason is written for its user; any other error is the server's own, kept
 * in its log, never posted in a channel.
 */
describe('Discord replies: failures', function () {
  it('gives a refusal\'s reason', function () {
    const message = failureMessage('en', new Meteor.Error('denied', 'You may not roll for this character'));
    assert.include(message.content, 'You may not roll for this character');
  });

  it('gives no internal error\'s text', function () {
    const message = failureMessage('en', new Error('E11000 duplicate key error collection: meteor.creatureLogs'));
    assert.notInclude(message.content, 'E11000');
    assert.include(message.content, 'something went wrong');
    assert.include(failureMessage('fr', new Error('secret')).content, 'un problème est survenu');
  });
});
