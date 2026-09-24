import Docs from '/imports/api/docs/Docs';

Meteor.publish('docs', async function () {
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
