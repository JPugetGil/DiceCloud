import { getCreature } from '/imports/api/engine/loadCreatures';

export default async function getRootCreatureAncestor(property) {
  return await getCreature(property.root.id);
}
