import { getPropertyName } from '/imports/ui/i18n/propertyNames';

export default function getPropertyTitle(prop) {
  if (prop.name) return prop.name;
  return getPropertyName(prop.type);
}
