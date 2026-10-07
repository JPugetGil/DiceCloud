import { EJSON } from 'meteor/ejson';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import getUserLibraryIds from '/imports/api/library/getUserLibraryIds';
import computeCreature from '/imports/api/engine/computeCreature';
import {
  reifyNodeReferences, storeLibraryNodeReferences,
} from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import { applyNestedSetProperties, getFilter, renewDocIds } from '/imports/api/parenting/parentingFunctions';
import { removeCreatureWork } from '/imports/api/creature/creatures/methods/removeCreature';
import { removeCharacters } from '/imports/api/creature/creatureFolders/removeFromFolders';
import { addCreaturesToTracker } from '/imports/api/creature/creatureFolders/methods/initiativeMethods';
import { numberedNames } from '/imports/api/creature/creatureFolders/initiativeCreatures';
import { MAX_BOARD_MONSTERS, MAX_OWNED_MONSTERS, boardError } from '/imports/api/creature/creatureFolders/boardMonsters';
import { cleanAndValidate } from '/imports/api/utility/TypedSimpleSchema';
import rollDice from '/imports/parser/rollDice';

/*
 * A party board's monsters, on the server: the board's methods import this
 * module when called (monsterMethods.js), which keeps the library collections
 * out of the folders' load order.
 */

/**
 * Adds `count` copies of a bestiary monster (a library node of type
 * 'creature') to the folder's board, for its game master: each a creature of
 * type 'monster' of theirs, numbered when there are several, with the
 * template's picture and a copy of what the template holds, as a library node
 * is inserted in a sheet, but none of a character's default properties. Each
 * has the template's average hit points, or rolls its own: its hit dice plus
 * as many times its Constitution modifier. Computed before they reach the
 * board, and rolled into a fight under way. Returns their ids
 */
export async function addMonstersToBoard({
  folder, userId, nodeId, count = 1, rollHitPoints = false, sharedInitiative = false,
}) {
  const template = await LibraryNodes.findOneAsync({ _id: nodeId, removed: { $ne: true } });
  if (template?.type !== 'creature') {
    throw boardError('monsters.not-found', 'monsters.errors.notFound');
  }
  // From a library the game master reads: theirs, shared with them, or subscribed to
  if (!(await getUserLibraryIds(userId)).includes(template.root.id)) {
    throw boardError('monsters.library-denied', 'monsters.errors.libraryDenied');
  }
  const onBoard = await Creatures.find(
    { _id: { $in: folder.creatures || [] }, owner: userId, type: 'monster' }, { fields: { name: 1 } },
  ).fetchAsync();
  if (onBoard.length + count > MAX_BOARD_MONSTERS) {
    throw boardError('monsters.board-full', 'monsters.errors.boardFull', { limit: MAX_BOARD_MONSTERS });
  }
  // Monsters left on boards nobody plays any more still take room
  const owned = await Creatures.find({ owner: userId, type: 'monster' }).countAsync();
  if (owned + count > MAX_OWNED_MONSTERS) {
    throw boardError('monsters.limit', 'monsters.errors.limit', { limit: MAX_OWNED_MONSTERS });
  }

  const templateProps = templateProperties(await templateNodes(template, userId), template._id);
  const names = monsterNames(template.name || 'Monster', count, [
    ...onBoard.map(creature => creature.name),
    ...(folder.initiative?.entries || []).map(entry => entry.name),
  ]);
  const creatureIds = [];
  // The copies' hit dice, read off the first one once computed: false without any
  /** @type {Awaited<ReturnType<typeof getHitDice>> | undefined} */
  let hitDice;
  try {
    for (const name of names) {
      const creatureId = await Creatures.insertAsync({
        owner: userId,
        name,
        type: 'monster',
        picture: template.picture,
        avatarPicture: template.avatarPicture,
        settings: {},
        readers: [],
        writers: [],
        public: false,
      });
      creatureIds.push(creatureId);
      const props = copyProperties(templateProps, creatureId);
      if (rollHitPoints && hitDice) setHitPoints(props, hitDice.hitPoints.libraryNodeId, rollHitDice(hitDice));
      // At once, validated already: through the collection, one at a time,
      // 30 goblins took 7.4 s, 30 liches 50 s (2026-10-07)
      await CreatureProperties.rawCollection().insertMany(props, { ordered: true });
      await computeCreature(creatureId);
      if (rollHitPoints && hitDice === undefined) {
        hitDice = await getHitDice(creatureId);
        if (hitDice) {
          await CreatureProperties.updateAsync(hitDice.hitPoints._id, {
            $set: { 'baseValue.calculation': String(rollHitDice(hitDice)) },
          }, { selector: { type: 'attribute' } });
          await computeCreature(creatureId);
        }
      }
    }
  } catch (e) {
    for (const creatureId of creatureIds) await removeCreatureWork(creatureId);
    throw e;
  }

  // On the board at once, computed: one change for those who watch it
  await CreatureFolders.updateAsync(folder._id, { $addToSet: { creatures: { $each: creatureIds } } });
  if (folder.initiative?.round) {
    const updated = await CreatureFolders.findOneAsync(folder._id);
    await addCreaturesToTracker(updated, creatureIds, userId, { sharedRoll: sharedInitiative });
  }
  return creatureIds;
}

/**
 * Deletes the monster copies of the folder's board: off the board and its
 * tracker first, all at once, then each with everything it has. Its game
 * master's other creatures (non-player characters included) and the players'
 * characters stay. Returns how many were deleted
 */
export async function removeBoardMonsters(folder) {
  const monsterIds = await Creatures.find(
    { _id: { $in: folder.creatures || [] }, owner: folder.owner, type: 'monster' }, { fields: { _id: 1 } },
  ).mapAsync(creature => creature._id);
  await removeCharacters(folder, monsterIds);
  for (const creatureId of monsterIds) await removeCreatureWork(creatureId);
  return monsterIds.length;
}

/**
 * The copies' names: the monster's alone for one of a kind, numbered after
 * those of the board and its tracker otherwise. A lone "Goblin" already there
 * counts as the first: one more is "Goblin 2"
 */
export function monsterNames(name, count, existingNames = []) {
  const base = name.trim();
  const taken = existingNames.map(existing => existing === base ? `${base} 1` : existing);
  const numbered = numberedNames(base, 2, taken);
  // Nothing of that name: numberedNames starts from 1
  if (count === 1 && numbered[0] === `${base} 1`) return [base];
  return numberedNames(base, Math.max(count, 2), taken).slice(0, count);
}

// What the template holds, as insertPropertyFromLibraryNode reads it: its
// references to other library nodes replaced by what they point to
async function templateNodes(template, userId) {
  const nodes = await LibraryNodes.find({
    ...getFilter.descendants(template),
    removed: { $ne: true },
  }, { sort: { left: 1 } }).fetchAsync();
  const reified = await reifyNodeReferences(nodes, userId);
  storeLibraryNodeReferences(reified);
  return reified;
}

// The template's nodes as a creature's properties, cleaned and validated as
// the collection inserts them: the template's children at the top level,
// nested sets of their own. Once per template, the copies differing only in ids
function templateProperties(nodes, templateId) {
  const props = EJSON.clone(nodes);
  for (const prop of props) {
    // The copies' creature, until each has its own
    prop.root = { collection: 'creatures', id: templateId };
    if (prop.parentId === templateId) delete prop.parentId;
  }
  props.sort((a, b) => a.left - b.left);
  applyNestedSetProperties(props);
  return props.map(prop => ({
    ...cleanAndValidate(CreatureProperties.simpleSchema(prop), prop),
    _id: prop._id,
  }));
}

// A copy of the template's properties for the creature, with new ids
function copyProperties(templateProps, creatureId) {
  const props = EJSON.clone(templateProps);
  renewDocIds({ docArray: props });
  for (const prop of props) prop.root = { collection: 'creatures', id: creatureId };
  return props;
}

/**
 * The computed creature's hit dice ({ number, size, constitutionMod }) and the
 * hit points they roll, or false without them
 */
async function getHitDice(creatureId) {
  const active = {
    'root.id': creatureId, removed: { $ne: true }, inactive: { $ne: true }, overridden: { $ne: true },
  };
  const hitDice = await CreatureProperties.findOneAsync({ ...active, type: 'attribute', variableName: 'hitDice' });
  const hitPoints = await CreatureProperties.findOneAsync({ ...active, type: 'attribute', variableName: 'hitPoints' });
  const number = hitDice?.total;
  const size = Number(hitDice?.hitDiceSize?.slice(1));
  // rollDice rolls up to 100 dice
  if (!hitPoints?.libraryNodeId || !Number.isInteger(number) || number < 1 || number > 100 || !(size > 0)) {
    return false;
  }
  return { number, size, constitutionMod: hitDice.constitutionMod || 0, hitPoints };
}

// Hit points rolled from the hit dice, at least 1
function rollHitDice({ number, size, constitutionMod }) {
  const total = rollDice(number, size).reduce((sum, die) => sum + die, 0);
  return Math.max(1, total + number * constitutionMod);
}

// The copy's hit points, before they are inserted: its maximum
function setHitPoints(props, libraryNodeId, hitPoints) {
  const prop = props.find(prop => prop.libraryNodeId === libraryNodeId);
  if (prop) prop.baseValue = { calculation: String(hitPoints) };
}
