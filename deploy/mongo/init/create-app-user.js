// Runs once, when the database is first created: the app's own account, which
// can only read and write its database. root is kept for backups and restores.
db.getSiblingDB('admin').createUser({
  user: 'dicecloud',
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: 'readWrite', db: process.env.MONGO_APP_DATABASE || 'dicecloud' }],
});
