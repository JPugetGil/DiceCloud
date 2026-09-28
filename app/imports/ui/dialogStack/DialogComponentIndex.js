import { defineAsyncComponent } from 'vue';
// Load commonly used dialogs immediately
import ActionDialog from '/imports/ui/creature/actions/ActionDialog.vue';
import CharacterCreationDialog from '/imports/ui/creature/character/CharacterCreationDialog.vue';
import CreatureFormDialog from '/imports/ui/creature/CreatureFormDialog.vue';
import CreaturePropertyDialog from '/imports/ui/creature/creatureProperties/CreaturePropertyDialog.vue';
import CreaturePropertyFromLibraryDialog from '/imports/ui/creature/creatureProperties/CreaturePropertyFromLibraryDialog.vue';
import CreatureRootDialog from '/imports/ui/creature/character/CreatureRootDialog.vue';
import DeleteConfirmationDialog from '/imports/ui/dialogStack/DeleteConfirmationDialog.vue';
import ExperienceInsertDialog from '/imports/ui/creature/experiences/ExperienceInsertDialog.vue';
import ExperienceListDialog from '/imports/ui/creature/experiences/ExperienceListDialog.vue';
import HelpDialog from '/imports/ui/dialogStack/HelpDialog.vue';
import ImagePreviewDialog from '/imports/ui/files/userImages/ImagePreviewDialog.vue';
import InsertPropertyDialog from '/imports/ui/properties/InsertPropertyDialog.vue';
import LevelUpDialog from '/imports/ui/creature/slots/LevelUpDialog.vue';
import LibraryBrowserDialog from '/imports/ui/library/LibraryBrowserDialog.vue';
import SelectLibraryNodeDialog from '/imports/ui/library/SelectLibraryNodeDialog.vue';
import SlotFillDialog from '/imports/ui/creature/slots/SlotFillDialog.vue';
import TransferOwnershipDialog from '/imports/ui/sharing/TransferOwnershipDialog.vue';

// Lazily load less common dialogs. They need defineAsyncComponent: a bare
// `() => import()` is taken for a functional component, and the dialog would
// render as the text "[object Promise]".
const ArchiveDialog = defineAsyncComponent(() => import('/imports/ui/creature/archive/ArchiveDialog.vue'));
const CastSpellWithSlotDialog = defineAsyncComponent(() => import('/imports/ui/properties/components/spells/CastSpellWithSlotDialog.vue'));
const CharacterImportDialog = defineAsyncComponent(() => import('/imports/ui/creature/character/CharacterImportDialog.vue'));
const DeleteUserAccountDialog = defineAsyncComponent(() => import('/imports/ui/user/DeleteUserAccountDialog.vue'));
const DependencyGraphDialog = defineAsyncComponent(() => import('/imports/ui/creature/dependencyGraph/DependencyGraphDialog.vue'));
const ImageInputDialog = defineAsyncComponent(() => import('/imports/ui/files/userImages/ImageInputDialog.vue'));
const LibraryCollectionCreationDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryCollectionCreationDialog.vue'));
const LibraryCollectionEditDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryCollectionEditDialog.vue'));
const LibraryCreationDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryCreationDialog.vue'));
const LibraryEditDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryEditDialog.vue'));
const LibraryNodeDialog = defineAsyncComponent(() => import('/imports/ui/library/LibraryNodeDialog.vue'));
const MoveLibraryNodeDialog = defineAsyncComponent(() => import('/imports/ui/library/MoveLibraryNodeDialog.vue'));
const ShareDialog = defineAsyncComponent(() => import('/imports/ui/sharing/ShareDialog.vue'));
const UsernameDialog = defineAsyncComponent(() => import('/imports/ui/user/UsernameDialog.vue'));

export default {
  ActionDialog,
  ArchiveDialog,
  CastSpellWithSlotDialog,
  CharacterCreationDialog,
  CharacterImportDialog,
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
  LibraryNodeDialog,
  MoveLibraryNodeDialog,
  SelectLibraryNodeDialog,
  ShareDialog,
  SlotFillDialog,
  TransferOwnershipDialog,
  UsernameDialog,
};
