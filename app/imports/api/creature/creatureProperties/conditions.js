/*
 * Conditions a character is given in one click (the Stats tab): the buffs its
 * libraries tag `condition`. A condition is told apart by its other library
 * tags (`blindedCondition`), which every language's library shares, else by
 * its name.
 */
export function conditionTags(libraryTags = []) {
  return libraryTags.filter(tag => tag !== 'condition').sort();
}

export function conditionKey(condition) {
  return condition.tags.length ? condition.tags.join(' ') : condition.name.trim().toLowerCase();
}

// Whether a buff on a character is that condition
export function isCondition(buff, condition) {
  if (buff.libraryNodeId === condition._id) return true;
  if (condition.tags.length && condition.tags.every(tag => buff.tags?.includes(tag))) return true;
  return !!buff.name && buff.name.trim().toLowerCase() === condition.name.trim().toLowerCase();
}
