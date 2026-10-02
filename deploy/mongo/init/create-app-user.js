// The app's own account: it reads and writes its database, and may run the one
// cluster command Meteor needs to open change streams, getDefaultRWConcern.
// root is kept for backups and restores.
//
// Run when the database is created (the image's init scripts), and again by
// `dicecloud.sh start`, so that a database created by an older version of this
// script gets what a newer one grants. Running it twice changes nothing.
const admin = db.getSiblingDB('admin');
const database = process.env.MONGO_APP_DATABASE || 'dicecloud';

if (!admin.getRole('meteorChangeStreams')) {
  admin.createRole({
    role: 'meteorChangeStreams',
    privileges: [{ resource: { cluster: true }, actions: ['getDefaultRWConcern'] }],
    roles: [],
  });
}

const roles = [
  { role: 'readWrite', db: database },
  { role: 'meteorChangeStreams', db: 'admin' },
];
if (admin.getUser('dicecloud')) {
  admin.grantRolesToUser('dicecloud', roles);
} else {
  admin.createUser({ user: 'dicecloud', pwd: process.env.MONGO_APP_PASSWORD, roles });
}
