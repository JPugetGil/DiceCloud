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
    const user = await Meteor.users.findOneAsync(this.userId, {
      fields: { subscribedCharacters: 1 }
    });
    const subs = user && user.subscribedCharacters || [];
    return [
      Creatures.find({
        $or: [
          { readers: userId },
          { writers: userId },
          { owner: userId },
          { _id: { $in: subs } },
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
      CreatureFolders.find({ owner: userId }),
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
