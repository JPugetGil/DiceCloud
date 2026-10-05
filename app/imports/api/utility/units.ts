/**
 * Units of measure. Everything is stored and computed in metric (metres,
 * kilograms): the libraries were converted once, formulas compute in metric.
 * A user who prefers feet or pounds gets the values converted for display
 * only, with the rules D&D itself uses between its editions:
 * 1.5 metres = 5 feet, and 1 pound = 0.5 kilogram.
 *
 * Distances written in text (descriptions, names) stay metric.
 */

// 5 feet = 1.5 metres, so 9 m (a 30-foot speed) shows as 30 ft
export const FEET_PER_METRE = 10 / 3;
// 1 pound = 0.5 kilogram, so 5 kg shows as 10 lb
export const POUNDS_PER_KILOGRAM = 2;

export type Quantity = 'distance' | 'weight';
// What an attribute's `unit` field holds: `none` opts an attribute out of the
// unit its variable name would otherwise give it
export const ATTRIBUTE_UNITS = ['none', 'distance', 'weight'] as const;

export const DISTANCE_UNITS = ['m', 'ft'] as const;
export const WEIGHT_UNITS = ['kg', 'lb'] as const;
export type DistanceUnit = typeof DISTANCE_UNITS[number];
export type WeightUnit = typeof WEIGHT_UNITS[number];
export type DisplayUnit = DistanceUnit | WeightUnit;

export interface UnitPreferences {
  distanceUnit?: string,
  weightUnit?: string,
}

/**
 * The unit of an attribute whose `unit` field is not set, by its variable
 * name. The distances are the `DISTANCES` set of the script that converted the
 * Libraries of Vexus to metric (tools/libraryImport/metric/convert.py): keep
 * the two in step. Some are only named by effects (`reach`), which take the
 * unit of the stats they change. An attribute can set its own `unit` instead.
 */
export const DEFAULT_ATTRIBUTE_UNITS: Readonly<Record<string, Quantity>> = {
  // Speeds
  speed: 'distance',
  baseSpeed: 'distance',
  unmodifiedSpeed: 'distance',
  speedModifier: 'distance',
  flySpeed: 'distance',
  swimSpeed: 'distance',
  climbSpeed: 'distance',
  // A misspelling one library's effects use
  climbspeed: 'distance',
  burrowSpeed: 'distance',
  cloakShapeSpeed: 'distance',
  familiarFlyingSpeed: 'distance',
  familiarSwimSpeed: 'distance',
  wildShapeSpeed: 'distance',
  wildShapeFlySpeed: 'distance',
  wildShapeSwimSpeed: 'distance',
  wildShapeClimbSpeed: 'distance',
  wildShapeBurrowSpeed: 'distance',
  // Senses
  darkvisionRange: 'distance',
  darkvision: 'distance',
  blindsight: 'distance',
  blindsightRange: 'distance',
  tremorsenseRange: 'distance',
  truesightRange: 'distance',
  devilsSight: 'distance',
  xrayVision: 'distance',
  astralSightRange: 'distance',
  wildShapeDarkvisionRange: 'distance',
  wildShapeDarkVisionRange: 'distance',
  wildShapeBlindsightRange: 'distance',
  wildShapeTremorsenseRange: 'distance',
  // Reach, jumps and light
  reach: 'distance',
  longJumpDistance: 'distance',
  highJumpDistance: 'distance',
  standingLongJumpDistance: 'distance',
  standingHighJumpDistance: 'distance',
  sunBladeLightRadius: 'distance',
  sunswordLightRadius: 'distance',
  // Weights
  carryingCapacity: 'weight',
};

// Effect operations whose amount is in the unit of the stat they change:
// `mul` is a factor, the others are not numbers of that stat
export const CONVERTED_EFFECT_OPERATIONS: ReadonlySet<string> = new Set([
  'base', 'add', 'set', 'min', 'max',
]);

export function getAttributeUnit(
  attribute?: { unit?: string, variableName?: string } | null
): Quantity | undefined {
  if (!attribute) return undefined;
  if (attribute.unit === 'distance' || attribute.unit === 'weight') return attribute.unit;
  if (attribute.unit === 'none') return undefined;
  return attribute.variableName ? DEFAULT_ATTRIBUTE_UNITS[attribute.variableName] : undefined;
}

/**
 * The unit of an effect's amount: that of the stats it targets, when they all
 * share one. `findAttribute` returns the attribute a stat names on the
 * effect's creature, if any; stats without one fall back to their default.
 */
export function getEffectUnit(
  effect?: { operation?: string, stats?: string[], targetByTags?: boolean } | null,
  findAttribute: (variableName: string) => { unit?: string, variableName?: string } | undefined
    = () => undefined,
): Quantity | undefined {
  if (!effect || effect.targetByTags || !effect.stats?.length) return undefined;
  if (effect.operation && !CONVERTED_EFFECT_OPERATIONS.has(effect.operation)) return undefined;
  const units = new Set(effect.stats.map(stat =>
    getAttributeUnit(findAttribute(stat) ?? { variableName: stat })
  ));
  if (units.size !== 1) return undefined;
  return [...units][0];
}

export function getDisplayUnit(quantity: Quantity, preferences?: UnitPreferences | null): DisplayUnit {
  if (quantity === 'distance') return preferences?.distanceUnit === 'ft' ? 'ft' : 'm';
  return preferences?.weightUnit === 'lb' ? 'lb' : 'kg';
}

// Clears floating point noise: 4.2 m is 14.000000000000002 ft unrounded.
// Displayed values keep 3 decimals (an arrow weighs 0.025 kg); values typed
// in by the user keep 6, so that converting them back loses nothing
function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** A stored (metric) value in the unit the user reads */
export function toDisplayValue(value: number, quantity: Quantity, preferences?: UnitPreferences | null): number {
  switch (getDisplayUnit(quantity, preferences)) {
    case 'ft': return round(value * FEET_PER_METRE, 3);
    case 'lb': return round(value * POUNDS_PER_KILOGRAM, 3);
    default: return value;
  }
}

/** A value the user typed in their unit, back to the stored (metric) value */
export function fromDisplayValue(value: number, quantity: Quantity, preferences?: UnitPreferences | null): number {
  switch (getDisplayUnit(quantity, preferences)) {
    case 'ft': return round(value / FEET_PER_METRE, 6);
    case 'lb': return round(value / POUNDS_PER_KILOGRAM, 6);
    default: return value;
  }
}
