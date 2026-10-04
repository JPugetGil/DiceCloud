import { inject } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import CreatureVariables from '/imports/api/creature/creatures/CreatureVariables';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import parserFunctions from '/imports/parser/functions';

const FUNCTION_SUGGESTIONS = Object.entries(parserFunctions).map(([name, fn]) => ({
  insert: `${name}(`,
  label: name,
  detail: fn.comment,
  kind: 'function',
}));

/**
 * What a formula field suggests: the variables of the character whose
 * property is edited, or, in a library, the variable names of the library
 * nodes loaded; then the functions formulas can call.
 */
export default function useFormulaSuggestions() {
  /** @type {{ creatureId?: string, variablesCreatureId?: string }} */
  const context = inject('context', {});
  return autorun(() => {
    // A property dialog sets creatureId; the insert dialog, variablesCreatureId
    const creatureId = context.creatureId || context.variablesCreatureId;
    const variables = creatureId
      ? creatureVariableSuggestions(creatureId)
      : libraryVariableSuggestions();
    return [...variables, ...FUNCTION_SUGGESTIONS];
  }).result;
}

function creatureVariableSuggestions(creatureId) {
  const variables = CreatureVariables.findOne({ _creatureId: creatureId });
  if (!variables) return [];
  return Object.keys(variables)
    .filter(name => !name.startsWith('_'))
    .map(name => ({ insert: name, label: name, kind: 'variable', creatureId }));
}

function libraryVariableSuggestions() {
  const names = new Map();
  LibraryNodes.find(
    { variableName: { $exists: true, $ne: '' }, removed: { $ne: true } },
    { fields: { variableName: 1, name: 1 } },
  ).forEach(node => {
    if (!names.has(node.variableName)) names.set(node.variableName, node.name);
  });
  return [...names].map(([name, propName]) => ({
    insert: name, label: name, detail: propName, kind: 'variable',
  }));
}

/**
 * What a character's variable is, for the suggestions shown: its property's
 * name and value. Read when shown, not for every variable of the character.
 */
export function describeCreatureVariable(suggestion) {
  if (!suggestion.creatureId) return suggestion.detail;
  const variables = CreatureVariables.findOne(
    { _creatureId: suggestion.creatureId }, { fields: { [suggestion.label]: 1 } },
  );
  let variable = variables?.[suggestion.label];
  if (variable?._propId) {
    variable = CreatureProperties.findOne(variable._propId.split('_')[0], {
      fields: { name: 1, value: 1 },
    });
  }
  if (!variable) return undefined;
  const value = variable.value;
  const shown = typeof value === 'number' || typeof value === 'boolean'
    || (typeof value === 'string' && value.length < 40) ? value : undefined;
  return [variable.name, shown].filter(part => part !== undefined && part !== '').join(' · ') || undefined;
}
