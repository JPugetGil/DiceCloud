/**
 * Read-only access to the development database, to find the test account's
 * character and sample data for the checks. Nothing here writes: the checks
 * change data only through the app, as a user would.
 */
const { MongoClient } = require('mongodb');
const { MONGO_URL, USERNAME } = require('./config');

async function withDb(fn) {
  const client = await MongoClient.connect(MONGO_URL);
  try {
    return await fn(client.db());
  } finally {
    await client.close();
  }
}

/** The test account and its first character (run `npm run setup` to create them) */
async function getTestUser() {
  return withDb(async db => {
    const user = await db.collection('users').findOne({ username: USERNAME }, { projection: { username: 1 } });
    if (!user) throw new Error(`No ${USERNAME} account. Run "npm run setup" first.`);
    const creature = await db.collection('creatures').findOne(
      { owner: user._id, removed: { $ne: true } }, { projection: { name: 1 } }
    );
    if (!creature) throw new Error(`${USERNAME} has no character. Run "npm run setup" first.`);
    return { userId: user._id, creatureId: creature._id };
  });
}

module.exports = { withDb, getTestUser };
