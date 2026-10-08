import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { Meteor } from 'meteor/meteor';
import { AsyncTracker } from 'meteor/nachocodoner:reactive-publish';
import reactivePublication from '/imports/api/utility/server/reactivePublication';

// Cursors and nothing else: their observers keep them up to date. This used
// to be an autorun, which every change to a folder reran, every turn of a
// fight included, leaving the previous run's observers running
Meteor.publish('characterList', function () {
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
    // invitation link's token and the initiative creatures' stats are the
    // party board's to publish, to its game master
    CreatureFolders.find(
      { $or: [{ owner: userId }, { members: userId }] }, { fields: { inviteToken: 0, initiativeStats: 0 } },
    ),
  ];
});

// The classes of the user's characters: the character list shows their class and level
Meteor.publish('characterListClasses', function () {
  reactivePublication(this, async function () {
    const userId = this.userId;
    if (!userId) return [];
    const creatureIds = await Creatures.find({
      $or: [{ readers: userId }, { writers: userId }, { owner: userId }],
      type: 'pc',
    }, { fields: { _id: 1 } }).mapAsync(creature => creature._id);
    // Made outside the computation: a class that levels up needs no rerun
    return AsyncTracker.nonreactive(() => CreatureProperties.find({
      'root.id': { $in: creatureIds },
      type: 'class',
      removed: { $ne: true },
    }, {
      fields: { root: 1, type: 1, name: 1, level: 1, left: 1, inactive: 1, removed: 1 },
    }));
  });
});
