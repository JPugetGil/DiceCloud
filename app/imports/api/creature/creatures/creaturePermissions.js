import Creatures from '/imports/api/creature/creatures/Creatures';
import {
  assertEditPermission as editPermission,
  assertViewPermission as viewPermission,
  assertOwnership as ownership
} from '/imports/api/sharing/sharingPermissions';

async function getCreature(creature, fields) {
  if (typeof creature === 'string') {
    return await Creatures.findOneAsync(creature, { fields });
  } else {
    return creature;
  }
}

export async function assertOwnership(creature, userId) {
  creature = await getCreature(creature, { owner: 1 });
  ownership(creature, userId);
}

export async function assertEditPermission(creature, userId) {
  creature = await getCreature(creature, { owner: 1, writers: 1 });
  await editPermission(creature, userId);
}

export async function assertViewPermission(creature, userId) {
  creature = await getCreature(creature, { owner: 1, readers: 1, writers: 1, public: 1 });
  await viewPermission(creature, userId);
}
