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
        v-if="!isOwner"
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
          {{ ownerName || '?' }}
        </v-list-item-title>
        <v-list-item-subtitle>
          {{ $t('library.collectionOwner') }}
        </v-list-item-subtitle>
      </v-list-item>
      <text-field
        :label="$t('library.nameLower')"
        :value="model.name"
        @change="(name, ack) => updateLibraryCollection({name}, ack)"
      />
      <text-area
        :label="$t('common.description')"
        :value="model.description"
        @change="(description, ack) => updateLibraryCollection({description}, ack)"
      />
      <smart-switch
        :value="model.showInMarket"
        :disabled="!isOwner"
        :label="$t('library.showInBrowser')"
        @change="(showInMarket, ack) => updateLibraryCollection({showInMarket}, ack)"
      />
      <smart-select
        :label="$t('library.libraries')"
        :items="libraryOptions"
        :value="model.libraries"
        :debounce-time="0"
        multiple
        chips
        deletable-chips
        :no-data-text="$t('library.noLibrariesFound')"
        @change="(libraries, ack) => updateLibraryCollection({libraries}, ack)"
      />
    </template>
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

<script setup>
import { useRouter } from 'vue-router';
import { Meteor } from 'meteor/meteor';
import { autorun, subscribe } from 'vue-meteor-tracker';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import LibraryCollections, { updateLibraryCollection as updateLibraryCollectionApi, removeLibraryCollection } from '/imports/api/library/LibraryCollections';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import Libraries from '/imports/api/library/Libraries';
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

subscribe(() => ['libraries']);
subscribe(() => ['libraryCollection', props._id]);

const model = autorun(() => LibraryCollections.findOne(props._id)).result;

const libraryOptions = autorun(() => {
  const userId = Meteor.userId();
  return Libraries.find(
    {
      $or: [
        { owner: userId },
        { writers: userId },
        { readers: userId },
        { public: true },
      ]
    },
    { sort: { name: 1 } }
  ).map(library => {
    return {
      title: library.name,
      value: library._id,
    };
  });
}).result;

const isOwner = autorun(() => {
  if (!model.value) return;
  return Meteor.userId() === model.value.owner;
}).result;

const ownerName = autorun(() => {
  if (!model.value) return;
  return Meteor.users.findOne(model.value.owner)?.username;
}).result;

async function updateLibraryCollection(update, ack) {
  try {
    await updateLibraryCollectionApi.callAsync({ _id: props._id, update });
    ack();
  } catch (error) {
    ack((error && error.reason) || error);
  }
}

function remove() {
  dialogStackStore.pushDialogStack({
    component: 'delete-confirmation-dialog',
    elementId: 'delete-library-button',
    data: {
      name: model.value?.name,
      typeName: t('library.collection')
    },
    async callback(confirmation) {
      if (!confirmation) return;
      try {
        await removeLibraryCollection.callAsync({ _id: props._id });
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
        collection: 'libraryCollections',
      }
    },
  });
}
</script>

<style lang="css" scoped>

</style>
