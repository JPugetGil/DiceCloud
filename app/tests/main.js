// Test entry point (meteor.testModule in package.json).
//
// `meteor test` runs neither client/main.js nor server/main.js, so nothing here
// has awaited Collection2.load() when the collection modules define themselves
// and call attachSchema(). aldeed:collection2 v4 ships a `static` entry for
// exactly this case, attaching synchronously on import.
//
// Rspack bundles the test files, so Meteor's eager load order (which used to put
// a file under lib/ first) no longer applies: this module imports the setup
// first and the suites afterwards, which is what sequences them now.
import 'meteor/aldeed:collection2/static';
import '/imports/api/simpleSchemaConfig';

const suites = require.context('/imports', true, /\.test\.(js|ts)$/);
suites.keys().forEach(suites);
