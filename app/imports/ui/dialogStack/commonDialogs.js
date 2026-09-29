// The commonly used dialogs, which DialogComponentIndex loads together as one
// chunk. Loaded one by one, they each imported the property forms and viewers
// they share in a different order, and Rspack could not order the stylesheets
// of the chunk they share ("Conflicting order" warnings).
export { default as ActionDialog } from '/imports/ui/creature/actions/ActionDialog.vue';
export { default as CharacterCreationDialog } from '/imports/ui/creature/character/CharacterCreationDialog.vue';
export { default as CreatureFormDialog } from '/imports/ui/creature/CreatureFormDialog.vue';
export { default as CreaturePropertyDialog } from '/imports/ui/creature/creatureProperties/CreaturePropertyDialog.vue';
export { default as CreaturePropertyFromLibraryDialog } from '/imports/ui/creature/creatureProperties/CreaturePropertyFromLibraryDialog.vue';
export { default as CreatureRootDialog } from '/imports/ui/creature/character/CreatureRootDialog.vue';
export { default as DeleteConfirmationDialog } from '/imports/ui/dialogStack/DeleteConfirmationDialog.vue';
export { default as ExperienceInsertDialog } from '/imports/ui/creature/experiences/ExperienceInsertDialog.vue';
export { default as ExperienceListDialog } from '/imports/ui/creature/experiences/ExperienceListDialog.vue';
export { default as HelpDialog } from '/imports/ui/dialogStack/HelpDialog.vue';
export { default as ImagePreviewDialog } from '/imports/ui/files/userImages/ImagePreviewDialog.vue';
export { default as InsertPropertyDialog } from '/imports/ui/properties/InsertPropertyDialog.vue';
export { default as LevelUpDialog } from '/imports/ui/creature/slots/LevelUpDialog.vue';
export { default as LibraryBrowserDialog } from '/imports/ui/library/LibraryBrowserDialog.vue';
export { default as SelectLibraryNodeDialog } from '/imports/ui/library/SelectLibraryNodeDialog.vue';
export { default as SlotFillDialog } from '/imports/ui/creature/slots/SlotFillDialog.vue';
export { default as TransferOwnershipDialog } from '/imports/ui/sharing/TransferOwnershipDialog.vue';
