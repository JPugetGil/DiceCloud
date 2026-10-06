// Registers the server side of the API. Methods not listed here are registered
// by the collection modules that use them, on the client and the server alike.

// REST routes
import '/imports/api/rest/server';

// Publications
import '/imports/api/creature/creatures/server/publications/characterList';
import '/imports/api/library/server/publications/library';
import '/imports/api/creature/creatures/server/publications/singleCharacter';
import '/imports/api/creature/creatureFolders/server/publications/partyBoard';
import '/imports/api/creature/creatureFolders/server/publications/characterCombat';
import '/imports/api/creature/experience/server/publications';
import '/imports/api/users/server/publications/users';
import '/imports/api/library/server/publications/slotFillers';
import '/imports/api/users/server/publications/ownedDocuments';
import '/imports/api/library/server/publications/searchLibraryNodes';
import '/imports/api/creature/archive/server/publications';
import '/imports/api/files/userImages/server/publications';
import '/imports/api/docs/server/publications';

// Cron jobs
import '/imports/api/parenting/server/deleteSoftRemovedDocuments';
import '/imports/api/engine/action/server/removeAbandonedActions';

// Methods
import '/imports/api/parenting/organizeMethods';
import '/imports/api/creature/creatureProperties/methods/index';
import '/imports/api/creature/archive/methods/index';
import '/imports/api/creature/creatures/methods/index';
import '/imports/api/engine/action/methods/index';
import '/imports/api/sharing/sharing';
import '/imports/api/files/methods/getS3Usage';
import '/imports/api/admin/methods/getDatabaseUsage';
