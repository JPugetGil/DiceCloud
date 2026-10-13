// How madge resolves the app's imports in .js and .vue files, as the build
// does: `/imports/...` from app/. TypeScript files resolve through tsconfig.json
const path = require('node:path');

module.exports = {
  resolve: {
    roots: [path.resolve(__dirname, '../../app')],
    extensions: ['.ts', '.js', '.mjs', '.vue', '.json'],
  },
};
