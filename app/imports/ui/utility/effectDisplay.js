/*
 * How an effect reads beside its icon (getEffectIcon.js): its operation's
 * name, and its number. Four components each had a copy of these, none of
 * which knew "set": a "set to 10" effect showed its pin and no number.
 */

/**
 * The name of an effect's operation, translated
 * @param {string | undefined} operation
 * @param {(key: string) => string} t
 */
export function effectOperationName(operation, t) {
  switch (operation) {
    case 'base': return t('effectOps.base');
    case 'add': return t('effectOps.add');
    case 'mul': return t('effectOps.mul');
    case 'min': return t('effectOps.min');
    case 'max': return t('effectOps.max');
    case 'set': return t('effectOps.set');
    case 'advantage': return t('effectOps.advantage');
    case 'disadvantage': return t('effectOps.disadvantage');
    case 'passiveAdd': return t('effectOps.passiveAdd');
    case 'fail': return t('effectOps.fail');
    case 'conditional': return t('effectOps.conditional');
    default: return operation;
  }
}

/**
 * The number an effect shows: its value, or its size for an addition (the
 * icon gives the sign), none for an operation without one
 * @param {string | undefined} operation
 * @param {unknown} value
 */
export function effectDisplayedValue(operation, value) {
  switch (operation) {
    case 'add':
    case 'passiveAdd': {
      const number = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
      return Number.isFinite(number) ? Math.abs(number) : value;
    }
    case 'base':
    case 'mul':
    case 'min':
    case 'max':
    case 'set':
      return value;
    default:
      return undefined;
  }
}
