import { debounce } from 'lodash';
import Creatures, { Creature } from '/imports/api/creature/creatures/Creatures';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties, { CreatureProperty, CreaturePropertyTypes } from '/imports/api/creature/creatureProperties/CreatureProperties';
import computeCreature from './computeCreature';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import type { PropertyType } from '/imports/api/properties/PropertyType.type';

const COMPUTE_DEBOUNCE_TIME = 100; // ms
export const loadedCreatures: Map<string, LoadedCreature> = new Map(); // creatureId => {creature, properties, etc.}

// function logLoadedCreatures() {
//   let creatureLoadString = '';
//   for (const [key, value] of loadedCreatures.entries()) {
//     creatureLoadString += `${key}: ${value.subs.size}\n`;
//   }
//   console.log(creatureLoadString);
// }

export function loadCreature(creatureId: string, subscription: Tracker.Computation) {
  if (!creatureId) throw 'creatureId is required';
  let creature = loadedCreatures.get(creatureId);
  if (!creature?.subs.has(subscription)) {
    subscription.onStop(() => {
      unloadCreature(creatureId, subscription);
    });
  }
  if (creature) {
    creature.subs.add(subscription);
  } else {
    creature = new LoadedCreature(subscription, creatureId);
    loadedCreatures.set(creatureId, creature);
  }
  // logLoadedCreatures()
}

export async function unloadAllCreatures() {
  const stopping: Promise<void>[] = [];
  loadedCreatures.forEach((creature, id) => {
    loadedCreatures.delete(id);
    stopping.push(creature.stop());
  });
  await Promise.all(stopping);
}

function unloadCreature(creatureId: string, subscription: Tracker.Computation) {
  if (!creatureId) throw 'creatureId is required';
  const creature = loadedCreatures.get(creatureId);
  if (!creature) return;
  creature.subs.delete(subscription);
  if (creature.subs.size === 0) {
    // Out of the map before stopping, so nothing new reads a dying cache
    loadedCreatures.delete(creatureId);
    creature.stop().catch(e => {
      console.error(`Failed to stop the observers of creature ${creatureId}`, e);
    });
  }
  // logLoadedCreatures()
}

/**
 * The loaded creature, once its cache is complete. Meteor 3 delivers an
 * observer's initial documents after observeChanges returns, so a creature is
 * in loadedCreatures -- and would stop readers falling back to the database --
 * before its maps are filled. Every read goes through here to wait for that.
 */
async function getLoadedCreature(creatureId: string) {
  const creature = loadedCreatures.get(creatureId);
  if (creature) await creature.ready;
  return creature;
}

export async function getSingleProperty(creatureId: string, propertyId: string) {
  const creature = await getLoadedCreature(creatureId)
  const property = creature?.properties.get(propertyId);
  if (property?.removed) return;
  if (property) {
    return EJSON.clone(property);
  }
  // console.time(`Cache miss on creature properties: ${creatureId}`)
  const prop = await CreatureProperties.findOneAsync({
    _id: propertyId,
    'root.id': creatureId,
    'removed': { $ne: true },
  });
  // console.timeEnd(`Cache miss on creature properties: ${creatureId}`);
  return prop;
}

export async function getProperties(creatureId: string): Promise<CreatureProperty[]> {
  const creature = await getLoadedCreature(creatureId);
  if (creature) {
    const props = Array.from(creature.properties.values())
      .sort((a, b) => a.left - b.left)
      .filter(prop => !prop.removed);
    return EJSON.clone(props);
  }
  // console.time(`Cache miss on creature properties: ${creatureId}`)
  const props = await CreatureProperties.find({
    'root.id': creatureId,
    'removed': { $ne: true },
  }, {
    sort: { left: 1 },
  }).fetchAsync();
  // console.timeEnd(`Cache miss on creature properties: ${creatureId}`);
  return props;
}

export async function getPropertiesOfType<T extends PropertyType>(creatureId: string, propType: T): Promise<CreaturePropertyTypes[T][]> {
  const creature = await getLoadedCreature(creatureId);
  if (creature) {
    const props = Array.from(creature.properties.values())
      .filter((prop): prop is CreaturePropertyTypes[T] => !prop.removed && prop.type === propType)
      .sort((a, b) => a.left - b.left);
    return EJSON.clone(props);
  }
  // console.time(`Cache miss on creature properties: ${creatureId}`)
  const props: CreaturePropertyTypes[T][] = await CreatureProperties.find({
    'root.id': creatureId,
    'removed': { $ne: true },
    'type': propType as any,
  }, {
    sort: { left: 1 },
  }).fetchAsync() as unknown as CreaturePropertyTypes[T][];
  // console.timeEnd(`Cache miss on creature properties: ${creatureId}`);
  return props;
}

/**
 * Get the properties of a creature that matches the filters given
 * @param creatureId The id of the creature
 * @param filterFn A function that returns true if the given prop matches the filter
 * @param mongoFilter A mongo selector that is exactly equal to the above function
 */
export async function getPropertiesByFilter(
  creatureId: string,
  filterFn: (value: CreatureProperty, index: number, array: CreatureProperty[]) => unknown,
  mongoFilter: Mongo.Selector<CreatureProperty>
) {
  const creature = await getLoadedCreature(creatureId);
  if (creature) {
    const props: CreatureProperty[] = Array.from(creature.properties.values())
      .filter(filterFn)
      .sort((a, b) => a.left - b.left);
    return EJSON.clone(props);
  }
  // console.time(`Cache miss on creature properties: ${creatureId}`)
  const props = await CreatureProperties.find({
    'root.id': creatureId,
    'removed': { $ne: true },
    ...mongoFilter
  } as any, {
    sort: { left: 1 },
  }).fetchAsync();
  // console.timeEnd(`Cache miss on creature properties: ${creatureId}`);
  return props;
}

export async function getCreature(creatureId: string) {
  const loadedCreature = await getLoadedCreature(creatureId);
  const loadedCreatureDoc = loadedCreature?.creature;
  if (loadedCreatureDoc) {
    return EJSON.clone(loadedCreatureDoc);
  }
  // console.time(`Cache miss on Creature: ${creatureId}`);
  const creature = await Creatures.findOneAsync(creatureId);
  // console.timeEnd(`Cache miss on Creature: ${creatureId}`);
  return creature;
}

export async function getVariables(creatureId: string) {
  const loadedCreature = await getLoadedCreature(creatureId);
  const loadedVariables = loadedCreature?.variables;
  if (loadedVariables) {
    return EJSON.clone(loadedVariables);
  }
  // console.time(`Cache miss on variables: ${creatureId}`);
  const variables = await CreatureVariables.findOneAsync({ _creatureId: creatureId });
  // console.timeEnd(`Cache miss on variables: ${creatureId}`);
  return variables;
}

export async function replaceLinkedVariablesWithProps(variables: any) {
  for (const key in variables) {
    const propId = variables[key]?._propId;
    if (!propId) continue;
    variables[key] = await getSingleProperty(variables._creatureId, propId);
  }
}

export async function getPropertyAncestors(creatureId: string, propertyId: string) {
  const prop = await getSingleProperty(creatureId, propertyId);
  if (!prop) return [];
  const loadedCreature = await getLoadedCreature(creatureId);
  if (loadedCreature) {
    // Get the ancestor properties from the cache
    const props: CreatureProperty[] = [];
    let currentProp: CreatureProperty | undefined = prop;
    // Iterate through parent chain to get all linked ancestors
    while (currentProp?.parentId) {
      currentProp = await getSingleProperty(creatureId, currentProp.parentId);
      if (currentProp) props.push(currentProp);
    }
    return EJSON.clone(props);
  } else {
    // Fetch from database
    return await CreatureProperties.find({
      ...getFilter.ancestors(prop),
      removed: { $ne: true },
    }, {
      sort: { left: 1 }
    }).fetchAsync();
  }
}

export async function getPropertyDescendants(creatureId: string, propertyId: string) {
  const property = await getSingleProperty(creatureId, propertyId);
  if (!property) return [];
  const creature = await getLoadedCreature(creatureId);
  if (creature) {
    const props: CreatureProperty[] = [];
    // Loop through all properties and find ones that match the nested set condition
    for (const prop of creature.properties.values()) {
      if (
        prop.left > property.left
        && prop.right < property.right
        && prop.removed !== true
      ) {
        props.push(prop);
      }
    }
    const cloneProps = EJSON.clone(props).sort((a, b) => a.left - b.left);
    return cloneProps;
  } else {
    return await CreatureProperties.find({
      ...getFilter.descendants(property),
      removed: { $ne: true },
    }, {
      sort: { left: 1 },
    }).fetchAsync();
  }
}

/**
 * @param {string} creatureId Creature ID
 * @param {string | any} property prop or prop ID to get children of
 * @returns {any[]} An array of child properties in tree order
 */
export async function getPropertyChildren(creatureId: string, property: string | CreatureProperty | undefined) {
  if (typeof property === 'string') {
    property = await getSingleProperty(creatureId, property);
  }
  if (!property) return [];
  // This propertyId will always appear in the parent of the children
  const creature = await getLoadedCreature(creatureId);
  if (creature) {
    const props: CreatureProperty[] = [];
    for (const prop of creature.properties.values()) {
      if (prop.parentId === property._id && prop.removed !== true) {
        props.push(prop);
      }
    }
    const cloneProps = EJSON.clone(props);
    return cloneProps.sort((a, b) => a.left - b.left);
  } else {
    return await CreatureProperties.find({
      'parentId': property._id,
      removed: { $ne: true },
    }, {
      sort: { left: 1 },
    }).fetchAsync();
  }
}

class LoadedCreature {
  subs!: Set<Tracker.Computation>;
  propertyObserver!: Meteor.LiveQueryHandle;
  creatureObserver!: Meteor.LiveQueryHandle;
  variablesObserver!: Meteor.LiveQueryHandle;
  // Settles once all three observers have delivered their initial documents
  ready!: Promise<void>;
  properties!: Map<string, CreatureProperty>;
  creature?: Creature;
  variables: any;

  constructor(sub: Tracker.Computation, creatureId: string) {
    const self = this;
    // This may be called from a subscription, but we don't want the observers
    // to be destroyed with it, so use a non-reactive context to observe
    // the required documents
    Tracker.nonreactive(() => {
      self.subs = new Set([sub]);
      const compute = debounce(Meteor.bindEnvironment(async () => {
        // It's possible that the creature was unloaded before we get around to computing it
        if (!loadedCreatures.has(creatureId)) return;
        await computeCreature(creatureId);
      }), COMPUTE_DEBOUNCE_TIME);

      self.properties = new Map();
      // Observe all creature properties which are needed for computation
      const propertyObserver = CreatureProperties.find({
        'root.id': creatureId,
      }).observeChangesAsync({
        added(id, fields: CreatureProperty) {
          fields._id = id;
          self.addProperty(fields);
          if (fields.dirty) compute();
        },
        changed(id, fields) {
          self.changeProperty(id, fields);
          if (fields.dirty) compute();
        },
        removed(id) {
          self.removeProperty(id);
          compute();
        },
      });

      // Observe the creature itself
      const creatureObserver = Creatures.find({
        _id: creatureId,
      }).observeChangesAsync({
        added(id, fields: Creature) {
          fields._id = id;
          self.addCreature(fields)
          if (fields.dirty) compute();
        },
        changed(id, fields) {
          self.changeCreature(id, fields);
          if (fields.dirty) compute();
        },
        removed() {
          self.removeCreature();
        },
      });

      // Observe the creature's variables
      const variablesObserver = CreatureVariables.find({
        _creatureId: creatureId,
      }, {
        fields: { _creatureId: 0 },
      }).observeChangesAsync({
        added(id, fields: any) {
          fields._id = id;
          self.addVariables(fields)
        },
        changed(id, fields) {
          self.changeVariables(id, fields);
        },
        removed() {
          self.removeVariables();
        },
      });

      // Each resolves once its observer has sent the initial documents
      self.ready = Promise.all([propertyObserver, creatureObserver, variablesObserver])
        .then(([properties, creature, variables]) => {
          self.propertyObserver = properties;
          self.creatureObserver = creature;
          self.variablesObserver = variables;
        });
    });
  }
  async stop() {
    // Stopping before the observers exist would leave them running forever
    await this.ready;
    this.propertyObserver.stop();
    this.creatureObserver.stop();
    this.variablesObserver.stop();
  }
  addProperty(prop: CreatureProperty) {
    this.properties.set(prop._id, prop);
  }
  changeProperty(id: string, fields: Partial<CreatureProperty>) {
    LoadedCreature.changeMap(id, fields, this.properties);
  }
  removeProperty(id: string) {
    this.properties.delete(id)
  }
  addCreature(creature: Creature) {
    this.creature = creature;
  }
  changeCreature(id: string, fields: Partial<Creature>) {
    LoadedCreature.changeDoc(this.creature, fields);
  }
  removeCreature() {
    delete this.creature;
  }
  addVariables(variables: any) {
    this.variables = variables;
  }
  changeVariables(id: string, fields: any) {
    LoadedCreature.changeDoc(this.variables, fields);
  }
  removeVariables() {
    delete this.variables;
  }
  static changeMap(id: string, fields: any, map: any) {
    const doc = map.get(id);
    LoadedCreature.changeDoc(doc, fields);
  }
  static changeDoc(doc: any, fields: any) {
    if (!doc) return;
    for (const key in fields) {
      if (key === undefined) {
        delete doc[key];
      } else {
        doc[key] = fields[key];
      }
    }
  }
}
