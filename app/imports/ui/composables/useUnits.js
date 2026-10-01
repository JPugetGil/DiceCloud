import { computed } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { useI18n } from 'vue-i18n';
import { getDisplayUnit, toDisplayValue, fromDisplayValue, getEffectUnit } from '/imports/api/utility/units';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';

/**
 * Shows stored (metric) distances and weights in the units the user chose on
 * the Account page (see /imports/api/utility/units). Signed out, or without a
 * choice, they stay metric.
 */
export default function useUnits() {
  const { t, locale } = useI18n();
  const preferences = autorun(() => {
    const prefs = Meteor.user()?.preferences;
    return { distanceUnit: prefs?.distanceUnit, weightUnit: prefs?.weightUnit };
  }).result;
  const numberFormat = computed(() => new Intl.NumberFormat(locale.value, {
    maximumFractionDigits: 3,
  }));

  const isNumber = value => typeof value === 'number' && Number.isFinite(value);

  /** The label of the unit a quantity is shown in: m, ft, kg or lb */
  function unitLabel(quantity) {
    return t(`units.${getDisplayUnit(quantity, preferences.value)}`);
  }

  /**
   * A stored value as a number and a unit label, converted and formatted.
   * Anything else (no unit, a string, a formula) comes back as it was.
   */
  function quantityParts(value, quantity) {
    if (!quantity || !isNumber(value)) return { value, unit: undefined };
    return {
      value: numberFormat.value.format(toDisplayValue(value, quantity, preferences.value)),
      unit: unitLabel(quantity),
    };
  }

  /** A stored value as one string, such as "30 ft" */
  function formatQuantity(value, quantity) {
    const parts = quantityParts(value, quantity);
    return parts.unit ? `${parts.value}\u00a0${parts.unit}` : parts.value;
  }

  /** A stored value as the number an input shows, in the user's unit */
  function toInputValue(value, quantity) {
    return isNumber(value) ? toDisplayValue(value, quantity, preferences.value) : value;
  }

  /**
   * A number the user typed, back to the stored (metric) value. Number fields
   * report strings; an empty one is left for the schema to clear
   */
  function fromInputValue(value, quantity) {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
    return isNumber(number) ? fromDisplayValue(number, quantity, preferences.value) : value;
  }

  return { preferences, unitLabel, quantityParts, formatQuantity, toInputValue, fromInputValue };
}

/**
 * The unit of an effect's amount: that of the attributes it changes on its
 * creature, which may set their own, or the one their names give them.
 * `getEffect` returns the effect.
 */
export function useEffectUnit(getEffect) {
  return autorun(() => {
    const effect = getEffect();
    const creatureId = effect?.root?.collection === 'creatures' ? effect.root.id : undefined;
    const findAttribute = variableName => creatureId && CreatureProperties.findOne({
      'root.id': creatureId,
      type: 'attribute',
      variableName,
      removed: { $ne: true },
      overridden: { $ne: true },
    }, { fields: { unit: 1, variableName: 1 } });
    return getEffectUnit(effect, findAttribute);
  }).result;
}
