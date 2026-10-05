import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { Meteor } from 'meteor/meteor';

Meteor.publish('characterList', function () {
  this.autorun(async function () {
    var userId = this.userId;
    if (!userId) {
      return [];
    }
    return [
      Creatures.find({
        $or: [
          { readers: userId },
          { writers: userId },
          { owner: userId },
        ],
        type: 'pc',
      }, {
        fields: {
          name: 1,
          initial: 1,
          alignment: 1,
          gender: 1,
          readers: 1,
          writers: 1,
          owner: 1,
          color: 1,
          picture: 1,
          avatarPicture: 1,
          public: 1,
          type: 1,
        }
      }
      ),
      // The user's folders, and the parties they play in for the sidebar. The
      // invitation link's token is the party board's to publish, to its owner
      CreatureFolders.find(
        { $or: [{ owner: userId }, { members: userId }] }, { fields: { inviteToken: 0 } },
      ),
    ];
  });
});

// The classes of the user's characters: the character list shows their class and level
Meteor.publish('characterListClasses', function () {
  this.autorun(async function () {
    const userId = this.userId;
    if (!userId) return [];
    const creatureIds = await Creatures.find({
      $or: [{ readers: userId }, { writers: userId }, { owner: userId }],
      type: 'pc',
    }, { fields: { _id: 1 } }).mapAsync(creature => creature._id);
    return CreatureProperties.find({
      'root.id': { $in: creatureIds },
      type: 'class',
      removed: { $ne: true },
    }, {
      fields: { root: 1, type: 1, name: 1, level: 1, left: 1, inactive: 1, removed: 1 },
    });
  });
});
