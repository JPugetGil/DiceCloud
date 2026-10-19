import { inject } from 'vue';

/**
 * What a dialog or a sheet tells the property components inside it, which
 * read it wherever they sit (provide('context', reactive({...})) in
 * CreaturePropertyDialog, CreatureRootDialog, CharacterSheetPrinted,
 * LibraryNodeDialog, InsertPropertyDialog, SlotFillDialog,
 * ExperienceInsertDialog...). Every field is optional: outside such a
 * dialog, the context is empty.
 *
 * @typedef {object} PropertyContext
 * @property {string} [creatureId] the creature the properties belong to
 * @property {boolean} [editPermission] false when the user may only read them
 * @property {boolean} [copyPermission] whether a library node may be copied
 * @property {boolean} [isLibraryForm] the forms edit a library node
 * @property {number} [debounceTime] the delay of the forms' fields, in ms
 * @property {string} [variablesCreatureId] the creature whose variables the
 *   formula suggestions offer (an insertion dialog's, without making the
 *   previews that creature's)
 */

/** The context the closest dialog or sheet provides, else an empty one */
export default function useContext() {
  return /** @type {PropertyContext} */ (inject('context', {}));
}
