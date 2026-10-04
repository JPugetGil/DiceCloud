import { defineAsyncComponent } from 'vue';

// Every dialog loads on demand. They need defineAsyncComponent: a bare
// `() => import()` is taken for a functional component, and the dialog would
// render as the text "[object Promise]".
//
// The commonly used ones share one chunk, which the browser prefetches once the
// app has started, so they still open at once. Imported statically, they put
// the property forms and the computation engine in the bundle every page waits
// for.
const commonDialogs = () => import(/* webpackPrefetch: true */ '/imports/ui/dialogStack/commonDialogs');

const ActionDialog = defineAsyncComponent(() => commonDialogs().then(m => m.ActionDialog));
const CharacterCreationDialog = defineAsyncComponent(() => commonDialogs().then(m => m.CharacterCreationDialog));
const CreatureFormDialog = defineAsyncComponent(() => commonDialogs().then(m => m.CreatureFormDialog));
const CreaturePropertyDialog = defineAsyncComponent(() => commonDialogs().then(m => m.CreaturePropertyDialog));
const CreaturePropertyFromLibraryDialog = defineAsyncComponent(() => commonDialogs().then(m => m.CreaturePropertyFromLibraryDialog));
const CreatureRootDialog = defineAsyncComponent(() => commonDialogs().then(m => m.CreatureRootDialog));
const DeleteConfirmationDialog = defineAsyncComponent(() => commonDialogs().then(m => m.DeleteConfirmationDialog));
const ExperienceInsertDialog = defineAsyncComponent(() => commonDialogs().then(m => m.ExperienceInsertDialog));
const ExperienceListDialog = defineAsyncComponent(() => commonDialogs().then(m => m.ExperienceListDialog));
const HelpDialog = defineAsyncComponent(() => commonDialogs().then(m => m.HelpDialog));
const ImagePreviewDialog = defineAsyncComponent(() => commonDialogs().then(m => m.ImagePreviewDialog));
const InsertPropertyDialog = defineAsyncComponent(() => commonDialogs().then(m => m.InsertPropertyDialog));
const LevelUpDialog = defineAsyncComponent(() => commonDialogs().then(m => m.LevelUpDialog));
const LibraryBrowserDialog = defineAsyncComponent(() => commonDialogs().then(m => m.LibraryBrowserDialog));
const SelectLibraryNodeDialog = defineAsyncComponent(() => commonDialogs().then(m => m.SelectLibraryNodeDialog));
const SlotFillDialog = defineAsyncComponent(() => commonDialogs().then(m => m.SlotFillDialog));
const TransferOwnershipDialog = defineAsyncComponent(() => commonDialogs().then(m => m.TransferOwnershipDialog));

// Less common dialogs
const ArchiveDialog = defineAsyncComponent(() => import('/imports/ui/creature/archive/ArchiveDialog.vue'));
const CastSpellWithSlotDialog = defineAsyncComponent(() => import('/imports/ui/properties/components/spells/CastSpellWithSlotDialog.vue'));
const CharacterImportDialog = defineAsyncComponent(() => import('/imports/ui/creature/character/CharacterImportDialog.vue'));
const CharacterSearchDialog = defineAsyncComponent(() => import('/imports/ui/creature/character/CharacterSearchDialog.vue'));
const DeleteUserAccountDialog = defineAsyncComponent(() => import('/imports/ui/user/DeleteUserAccountDialog.vue'));
const DependencyGraphDialog = defineAsyncComponent(() => import('/imports/ui/creature/dependencyGraph/DependencyGraphDialog.vue'));
const ImageInputDialog = defineAsyncComponent(() => import('/imports/ui/files/userImages/ImageInputDialog.vue'));
const LibraryCollectionCreationDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryCollectionCreationDialog.vue'));
const LibraryCollectionEditDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryCollectionEditDialog.vue'));
const LibraryCreationDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryCreationDialog.vue'));
const LibraryEditDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryEditDialog.vue'));
const LibraryNodeDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryNodeDialog.vue'));
const MoveLibraryNodeDialog = defineAsyncComponent(() => import('/imports/ui/library/MoveLibraryNodeDialog.vue'));
const LibraryImportDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryImportDialog.vue'));
const PartyCharactersDialog = defineAsyncComponent(() => import('/imports/ui/creature/party/PartyCharactersDialog.vue'));
const ShareDialog = defineAsyncComponent(() => import('/imports/ui/sharing/ShareDialog.vue'));
const UsernameDialog = defineAsyncComponent(() => import('/imports/ui/user/UsernameDialog.vue'));

export default {
  ActionDialog,
  ArchiveDialog,
  CastSpellWithSlotDialog,
  CharacterCreationDialog,
  CharacterImportDialog,
  CharacterSearchDialog,
  CreatureFormDialog,
  CreaturePropertyDialog,
  CreaturePropertyFromLibraryDialog,
  CreatureRootDialog,
  DeleteConfirmationDialog,
  DeleteUserAccountDialog,
  DependencyGraphDialog,
  ExperienceInsertDialog,
  ExperienceListDialog,
  HelpDialog,
  ImageInputDialog,
  ImagePreviewDialog,
  InsertPropertyDialog,
  LevelUpDialog,
  LibraryBrowserDialog,
  LibraryCollectionCreationDialog,
  LibraryCollectionEditDialog,
  LibraryCreationDialog,
  LibraryEditDialog,
  LibraryImportDialog,
  LibraryNodeDialog,
  MoveLibraryNodeDialog,
  PartyCharactersDialog,
  SelectLibraryNodeDialog,
  ShareDialog,
  SlotFillDialog,
  TransferOwnershipDialog,
  UsernameDialog,
};
