import Docs from '/imports/api/docs/Docs';
import { Meteor } from 'meteor/meteor';

Meteor.publish('docs', async function () {
  /** @type {Record<string, any>} a MongoDB selector */
  const filter = { published: true, removed: { $ne: true } };
  if (this.userId) {
    const user = await Meteor.users.findOneAsync(this.userId, {
      fields: {
        'roles': 1,
      }
    });
    if (user?.roles?.includes('docsWriter')) {
      delete filter.published;
      delete filter.removed
    }
  }
  return Docs.find(filter);
});
