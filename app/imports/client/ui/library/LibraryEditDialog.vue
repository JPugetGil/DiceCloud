<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ model && model.name }}
      </v-toolbar-title>
      <v-spacer />
      <v-btn
        variant="text"
        icon
        data-id="share-library-button"
        :disabled="!isOwner"
        @click="share"
      >
        <v-icon>mdi-share-variant</v-icon>
      </v-btn>
      <v-btn
        variant="text"
        icon
        data-id="delete-library-button"
        :disabled="!isOwner"
        @click="remove"
      >
        <v-icon>mdi-delete</v-icon>
      </v-btn>
    </template>
    <template v-if="model">
      <v-list-item
        v-if="!isOwner && ownerName"
        class="px-0"
        lines="two"
      >
        <template #prepend>
          <v-avatar>
            <v-icon>
              mdi-account
            </v-icon>
          </v-avatar>
        </template>

        <v-list-item-title>
          {{ ownerName }}
        </v-list-item-title>
        <v-list-item-subtitle>
          {{ $t('library.libraryOwner') }}
        </v-list-item-subtitle>
      </v-list-item>
      <text-field
        :label="$t('library.nameLower')"
        :value="model.name"
        @change="updateName"
      />
      <text-area
        :label="$t('common.description')"
        :value="model.description"
        @change="updateDescription"
      />
      <smart-switch
        :value="model.showInMarket"
        :disabled="!isOwner"
        :label="$t('library.showInBrowser')"
        @change="updateShowInMarket"
      />
    </template>
    <template v-if="removedDocs && removedDocs.length">
      <h3>{{ $t('library.recentlyDeleted') }}</h3>
      <v-list>
        <v-list-item
          v-for="removedModel in removedDocs"
          :key="removedModel._id"
        >
          <v-list-item-title>
            <tree-node-view :model="removedModel" />
          </v-list-item-title>

          <template #append>
            <v-btn
              color="accent"
              variant="text"
              @click="restore(removedModel._id)"
            >
              {{ $t('common.restore') }}
            </v-btn>
          </template>
        </v-list-item>
      </v-list>
    </template>
    <v-progress-circular
      v-if="!softRemovedLibraryNodesReady"
      indeterminate
      color="primary"
    />
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        data-id="delete-library-button"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.done') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup lang="js">
import { useRouter } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import Libraries, { updateLibraryName, updateLibraryDescription, updateLibraryShowInMarket, removeLibrary } from '/imports/api/library/Libraries';
import LibraryNodes, { restoreLibraryNode } from '/imports/api/library/LibraryNodes';
import TreeNodeView from '/imports/client/ui/properties/treeNodeViews/TreeNodeView.vue';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  _id: {
    type: String,
    default: undefined,
  },
});

const router = useRouter();

const { ready: softRemovedLibraryNodesReady } = subscribe(() => ['softRemovedLibraryNodes', props._id]);

const model = autorun(() => Libraries.findOne(props._id)).result;

const removedDocs = autorun(() => LibraryNodes.find({
  ...getFilter.descendantsOfRoot(props._id),
  removed: true,
  removedWith: { $exists: false },
}, {
  sort: { left: 1 },
})).result;

const isOwner = autorun(() => {
  if (!model.value) return;
  return Meteor.userId() === model.value.owner;
}).result;

const ownerName = autorun(() => {
  if (!model.value) return;
  const username = Meteor.users.findOne(model.value.owner)?.username;
  return username;
}).result;

async function updateName(value, ack) {
  try {
    await updateLibraryName.callAsync({ _id: props._id, name: value });
    ack();
  } catch (error) {
    ack(error && error.reason || error);
  }
}

async function updateDescription(value, ack) {
  try {
    await updateLibraryDescription.callAsync({ _id: props._id, description: value });
    ack();
  } catch (error) {
    ack(error && error.reason || error);
  }
}

async function updateShowInMarket(value, ack) {
  try {
    await updateLibraryShowInMarket.callAsync({ _id: props._id, value });
    ack();
  } catch (error) {
    ack(error && error.reason || error);
  }
}

function remove() {
  const _id = props._id;
  dialogStackStore.pushDialogStack({
    component: 'delete-confirmation-dialog',
    elementId: 'delete-library-button',
    data: {
      name: model.value?.name,
      typeName: t('library.library')
    },
    async callback(confirmation) {
      if (!confirmation) return;
      try {
        await removeLibrary.callAsync({ _id });
        await router.push({ name: 'library', replace: true });
        await dialogStackStore.popDialogStack();
      } catch (error) {
        console.error(error);
        snackbar({
          text: error.reason,
        });
      }
    }
  });
}

function share() {
  dialogStackStore.pushDialogStack({
    component: 'share-dialog',
    elementId: 'share-library-button',
    data: {
      docRef: {
        id: props._id,
        collection: 'libraries',
      }
    },
  });
}

async function restore(_id) {
  try {
    await restoreLibraryNode.callAsync({ _id });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  }
}
</script>

<style lang="css" scoped>

</style>
