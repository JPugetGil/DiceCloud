/*
 * What a level up changed (A11): the character's numbers before and after,
 * by property, and the features it gained. The card shows the first few.
 */

// The attributes a level raises, by attribute type, and which number it raises
const COUNTED = {
  healthBar: 'total',
  hitDice: 'total',
  spellSlot: 'total',
  resource: 'total',
  ability: 'value',
  stat: 'value',
  modifier: 'value',
};
// The order they are listed in: hit points first
const ORDER = ['healthBar', 'stat', 'modifier', 'ability', 'hitDice', 'spellSlot', 'resource'];
const GAINED_TYPES = ['feature', 'action', 'spell'];

/**
 * A character's numbers and features, from its properties (active ones):
 * `stats` by id ({ name, value, order }), `features` by id (name)
 */
export function levelSnapshot(properties = []) {
  const stats = new Map();
  const features = new Map();
  for (const prop of properties) {
    if (prop.type === 'attribute' && COUNTED[prop.attributeType] && prop.name) {
      const value = prop[COUNTED[prop.attributeType]];
      if (typeof value === 'number') {
        stats.set(prop._id, { name: prop.name, value, order: ORDER.indexOf(prop.attributeType) });
      }
    } else if (GAINED_TYPES.includes(prop.type) && prop.name) {
      features.set(prop._id, prop.name);
    }
  }
  return { stats, features };
}

/**
 * What changed between two snapshots: the numbers that went up or down
 * (`changed`, hit points first), and the features gained (`gained`)
 */
export function levelChanges(before, after) {
  const changed = [];
  after.stats.forEach((stat, id) => {
    const previous = before.stats.get(id);
    if (previous && previous.value !== stat.value) {
      changed.push({ id, name: stat.name, from: previous.value, to: stat.value, order: stat.order });
    }
  });
  changed.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  const gained = [];
  after.features.forEach((name, id) => {
    if (!before.features.has(id)) gained.push(name);
  });
  return { changed: changed.map(({ order, ...change }) => change), gained }; // eslint-disable-line @typescript-eslint/no-unused-vars
}
