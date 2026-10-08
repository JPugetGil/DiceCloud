import SimpleSchema from 'meteor/aldeed:simple-schema';
import Creatures from '/imports/api/creature/creatures/Creatures';
import Experiences from '/imports/api/creature/experience/Experiences';
import { assertViewPermission } from '/imports/api/creature/creatures/creaturePermissions';
import { Meteor } from 'meteor/meteor';
import reactivePublication from '/imports/api/utility/server/reactivePublication';

let schema = new SimpleSchema({
  creatureId: {
    type: String,
    max: 32,
  },
});

Meteor.publish('experiences', function (creatureId) {
  schema.validate({ creatureId });
  reactivePublication(this, async function () {
    let userId = this.userId;
    if (!userId) {
      return [];
    }
    let creatureCursor = Creatures.find({
      _id: creatureId,
      $or: [
        { readers: userId },
        { writers: userId },
        { owner: userId },
        { public: true },
      ],
    });
    try {
      await assertViewPermission((await creatureCursor.fetchAsync())[0], this.userId);
    } catch {
      return [];
    }
    return [
      Experiences.find({
        creatureId,
      }),
    ];
  });
});
