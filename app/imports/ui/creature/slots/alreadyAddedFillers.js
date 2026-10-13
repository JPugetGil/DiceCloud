/*
 * A slot's `unique` setting: a filler already added is offered again, but
 * disabled. What counts as added is a copy of the library node, which keeps
 * its id in `libraryNodeId` (insertPropertyFromLibraryNode): directly under
 * the slot (uniqueInSlot, the default), or anywhere on the creature
 * (uniqueInCreature). uniqueInSlot looked for copies whose root was the slot,
 * whereas a creature's properties all have the creature as their root: it
 * never found one.
 */

/**
 * The selector of the creature's properties that count as added fillers;
 * undefined when the slot takes the same filler again, or without a creature
 * (a library's slot tried out)
 * @param {{ _id?: string, unique?: string } | undefined} slot
 * @param {string | undefined} creatureId
 */
export function alreadyAddedSelector(slot, creatureId) {
  if (!slot || !creatureId) return undefined;
  const added = { 'root.id': creatureId, libraryNodeId: { $exists: true }, removed: { $ne: true } };
  if (slot.unique === 'uniqueInSlot') return { ...added, parentId: slot._id };
  if (slot.unique === 'uniqueInCreature') return added;
  return undefined;
}

/**
 * Whether a filler is among the added library nodes' ids: the node itself,
 * or for a reference, the node it names, which is what its copy comes from
 * @param {{ _id: string, type?: string, cache?: { node?: { _id?: string }, error?: string } }} node
 * @param {Set<string>} addedIds
 */
export function isAlreadyAdded(node, addedIds) {
  if (addedIds.has(node._id)) return true;
  const referenced = node.type === 'reference' ? node.cache?.node?._id : undefined;
  return !!referenced && addedIds.has(referenced);
}
