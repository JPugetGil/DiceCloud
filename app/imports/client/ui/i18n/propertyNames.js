import PROPERTIES, { getPropertyName as getEnglishName } from '/imports/constants/PROPERTIES';
import { translateOr } from '/imports/client/ui/i18n';

/**
 * The property types' names and help texts in the interface's language.
 * PROPERTIES keeps the English ones, which the server writes into logs.
 */
export function getPropertyName(type) {
  return type && translateOr(`propertyTypes.${type}.name`, getEnglishName(type));
}

export function getPropertyHelpText(type) {
  return translateOr(`propertyTypes.${type}.helpText`, PROPERTIES[type]?.helpText);
}
