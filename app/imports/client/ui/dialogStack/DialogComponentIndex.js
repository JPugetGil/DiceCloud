import { defineAsyncComponent } from 'vue';
// Load commonly used dialogs immediately
import ActionDialog from '/imports/client/ui/creature/actions/ActionDialog.vue';
import CharacterCreationDialog from '/imports/client/ui/creature/character/CharacterCreationDialog.vue';
import CreatureFormDialog from '/imports/client/ui/creature/CreatureFormDialog.vue';
import CreaturePropertyDialog from '/imports/client/ui/creature/creatureProperties/CreaturePropertyDialog.vue';
import CreaturePropertyFromLibraryDialog from '/imports/client/ui/creature/creatureProperties/CreaturePropertyFromLibraryDialog.vue';
import CreatureRootDialog from '/imports/client/ui/creature/character/CreatureRootDialog.vue';
import DeleteConfirmationDialog from '/imports/client/ui/dialogStack/DeleteConfirmationDialog.vue';
import ExperienceInsertDialog from '/imports/client/ui/creature/experiences/ExperienceInsertDialog.vue';
import ExperienceListDialog from '/imports/client/ui/creature/experiences/ExperienceListDialog.vue';
import HelpDialog from '/imports/client/ui/dialogStack/HelpDialog.vue';
import ImagePreviewDialog from '/imports/client/ui/files/userImages/ImagePreviewDialog.vue';
import InsertPropertyDialog from '/imports/client/ui/properties/InsertPropertyDialog.vue';
import LevelUpDialog from '/imports/client/ui/creature/slots/LevelUpDialog.vue';
import LibraryBrowserDialog from '/imports/client/ui/library/LibraryBrowserDialog.vue';
import SelectLibraryNodeDialog from '/imports/client/ui/library/SelectLibraryNodeDialog.vue';
import SlotFillDialog from '/imports/client/ui/creature/slots/SlotFillDialog.vue';
import TransferOwnershipDialog from '/imports/client/ui/sharing/TransferOwnershipDialog.vue';

// Lazily load less common dialogs. Vue 3 needs defineAsyncComponent for this:
// a bare `() => import()` is taken for a functional component, and the dialog
// rendered as the text "[object Promise]". Vue 2 accepted the bare factory.
const ArchiveDialog = defineAsyncComponent(() => import('/imports/client/ui/creature/archive/ArchiveDialog.vue'));
const CastSpellWithSlotDialog = defineAsyncComponent(() => import('/imports/client/ui/properties/components/spells/CastSpellWithSlotDialog.vue'));
const CharacterImportDialog = defineAsyncComponent(() => import('/imports/client/ui/creature/character/CharacterImportDialog.vue'));
const DeleteUserAccountDialog = defineAsyncComponent(() => import('/imports/client/ui/user/DeleteUserAccountDialog.vue'));
const DependencyGraphDialog = defineAsyncComponent(() => import('/imports/client/ui/creature/dependencyGraph/DependencyGraphDialog.vue'));
const ImageInputDialog = defineAsyncComponent(() => import('../files/userImages/ImageInputDialog.vue'));
const LibraryCollectionCreationDialog = defineAsyncComponent(() => import('/imports/client/ui/library/LibraryCollectionCreationDialog.vue'));
const LibraryCollectionEditDialog = defineAsyncComponent(() => import('/imports/client/ui/library/LibraryCollectionEditDialog.vue'));
const LibraryCreationDialog = defineAsyncComponent(() => import('/imports/client/ui/library/LibraryCreationDialog.vue'));
const LibraryEditDialog = defineAsyncComponent(() => import('/imports/client/ui/library/LibraryEditDialog.vue'));
const LibraryNodeDialog = defineAsyncComponent(() => import('/imports/client/ui/library/LibraryNodeDialog.vue'));
const MoveLibraryNodeDialog = defineAsyncComponent(() => import('/imports/client/ui/library/MoveLibraryNodeDialog.vue'));
const ShareDialog = defineAsyncComponent(() => import('/imports/client/ui/sharing/ShareDialog.vue'));
const UsernameDialog = defineAsyncComponent(() => import('/imports/client/ui/user/UsernameDialog.vue'));

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
