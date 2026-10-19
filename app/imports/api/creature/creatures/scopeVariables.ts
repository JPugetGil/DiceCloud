import type ParseNode from '/imports/parser/parseTree/ParseNode';
import array from '/imports/parser/parseTree/array';
import constant, { isFiniteNode } from '/imports/parser/parseTree/constant';
import { getCollectionByName } from '/imports/api/parenting/docReferences';

/*
 * A creature's variables as calculations read them: the scope of a creature
 * (its CreatureVariables document while it computes or acts), where a
 * variable is a value or a link to the property that holds it.
 *
 * The accessors of the parser read their variables here. So this module
 * imports neither the parser nor the creatures' cache: both reach the
 * accessors again, and these readers lived in CreatureVariables.ts, which
 * made the parser, the engine and the property schemas one import cycle
 * (tests/cycles). Each gives what it reads instead, as it loads: the
 * creatures' cache its properties (setPropertyReader, loadCreatures.ts), the
 * parser its parse (setCalculationParser, parser.ts). Until the cache does, a
 * property is read from its collection, as the cache reads one it does not
 * hold (always so on the client, which loads no creature).
 */

type PropertyReader = (creatureId: string, propertyId: string) => Promise<any>;

let readProperty: PropertyReader = (creatureId, propertyId) => getCollectionByName('creatureProperties').findOneAsync({
  _id: propertyId,
  'root.id': creatureId,
  removed: { $ne: true },
});
let parseCalculation: ((calculation: string) => ParseNode) | undefined;

/** A creature's property by its id, as the creatures' cache holds it */
export function setPropertyReader(reader: PropertyReader) {
  readProperty = reader;
}

/** A calculation's parse tree: the parser's parse */
export function setCalculationParser(parse: (calculation: string) => ParseNode) {
  parseCalculation = parse;
}

/**
 * Get the property from the given scope, respecting properties that are just a link to the actual
 * property document
 */
export async function getFromScope(name: string, scope) {
  let value = scope?.[name];
  if (value?._propId) {
    const [propId, rowIdentifier, rowNumber] = value._propId.split('_');
    value = await readProperty(scope._creatureId, propId);
    if (rowIdentifier === 'row' && value?.type === 'pointBuy') {
      value = value.values[rowNumber];
    }
  }
  // A constant's parsed value only exists while the creature computes: the
  // stored property keeps just its calculation, so a linked constant (every
  // `showPHB`-style source flag) read undefined everywhere else
  if (value?.type === 'constant' && value.value === undefined && value.calculation && parseCalculation) {
    try {
      value = { ...value, value: parseCalculation(value.calculation) };
    } catch {
      // A calculation that doesn't parse stays undefined, as in the computation
    }
  }
  return value;
}

export async function getNumberFromScope(name, scope) {
  const parseNode = await getParseNodeFromScope(name, scope);
  if (!parseNode || !isFiniteNode(parseNode)) {
    return undefined;
  }
  return parseNode.value;
}

export async function getConstantValueFromScope(
  name, scope
) {
  const parseNode = await getParseNodeFromScope(name, scope);
  if (!parseNode) return;
  if (parseNode.parseType !== 'constant') return;
  return parseNode.value;
}

export async function getParseNodeFromScope(name, scope): Promise<ParseNode | undefined> {
  let value = await getFromScope(name, scope);
  if (!value) return;
  let valueType = getType(value);
  // Iterate into object.values
  while (valueType === 'object') {
    // Prefer the valueNode over the value
    if (value.valueNode) {
      value = value.valueNode;
    } else {
      value = value.value;
    }
    valueType = getType(value);
  }
  // Return a discovered parse node
  if (valueType === 'parseNode') {
    return value;
  }
  // Return a parse node based on the constant type returned
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return constant.create({ value });
  }
  // Return a parser array
  if (valueType === 'array') {
    // If the first value is a parse node, assume all the values are
    if (getType(value[0]) === 'parseNode') {
      return array.create({
        values: value,
      });
    }
    // Create the array from js primitives instead
    return array.fromConstantArray(value);
  }
}

function getType(val) {
  if (!val) return typeof val;
  if (Array.isArray(val)) return 'array';
  if (val.parseType) return 'parseNode';
  return typeof val;
}
