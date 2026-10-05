<template>
  <v-app-bar
    color="secondary"
    theme="dark"
  >
    <v-app-bar-nav-icon
      :aria-label="$t('nav.openMenu')"
      @click="toggleDrawer"
    />
    <v-btn
      variant="text"
      icon
      @click="back"
    >
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-toolbar-title>
      {{ libraryCollection && libraryCollection.name }}
    </v-toolbar-title>
    <div
      v-if="libraryCollection && libraryCollection.subscriberCount"
      class="mx-2 text-body-medium text-medium-emphasis d-none d-sm-block"
    >
      {{ $t('library.subscribers', { count: formatNumber(libraryCollection.subscriberCount) }) }}
    </div>
    <v-btn
      v-if="showSubscribeButton"
      variant="tonal"
      :loading="loading"
      @click="subscribe(!subscribed)"
    >
      {{ subscribed ? $t('library.unsubscribe') : $t('library.subscribe') }}
    </v-btn>
    <v-btn
      v-if="libraryCollection"
      variant="text"
      icon
      :loading="downloading"
      :aria-label="$t('libraryFiles.downloadCollection')"
      data-id="library-collection-download-button"
      @click="download"
    >
      <v-icon>mdi-download</v-icon>
      <v-tooltip
        activator="parent"
        location="bottom"
        :text="$t('libraryFiles.downloadCollection')"
      />
    </v-btn>
    <v-btn
      v-if="canEdit"
      variant="text"
      icon
      data-id="library-collection-edit-button"
      @click="editLibraryCollection"
    >
      <v-icon>mdi-cog</v-icon>
    </v-btn>
  </v-app-bar>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { hasDocEditPermission } from '/imports/api/sharing/sharingPermissions';
import { exportLibrary, exportLibraryCollection } from '/imports/api/library/methods/libraryFiles';
import { downloadLibraryFile } from '/imports/ui/library/libraryFiles';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import { useI18n } from 'vue-i18n';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import formatter from '/imports/ui/utility/numberFormatter';
import { useAppStore } from '/imports/ui/stores/app';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

const route = useRoute();
const router = useRouter();

const loading = ref(false);

const toggleDrawer = () => appStore.toggleDrawer();

const formatNumber = (num) => formatter.format(num);

const libraryCollection = autorun(() => LibraryCollections.findOne(route.params.id)).result;

const subscribed = autorun(() => {
  const libraryCollectionId = route.params.id;
  const user = Meteor.user();
  return user?.subscribedLibraryCollections?.includes(libraryCollectionId);
}).result;

const showSubscribeButton = autorun(() => {
  const user = Meteor.user();
  const collection = libraryCollection.value;
  if (!user || !collection) return;
  const userId = user._id;
  if (user.subscribedLibraryCollections?.includes(collection._id)) {
    return true;
  } else if (
    collection.readers.includes(userId) ||
    collection.writers.includes(userId) ||
    collection.owner === userId
  ) {
    return false;
  } else {
    return true;
  }
}).result;

const canEdit = autorun(() => {
  return hasDocEditPermission(libraryCollection.value, Meteor.user());
}).result;

const { t } = useI18n();
const downloading = ref(false);

// One file with the collection and those of its libraries the user may copy
async function download() {
  downloading.value = true;
  try {
    const collection = await exportLibraryCollection.callAsync({ libraryCollectionId: route.params.id });
    const libraries = [];
    let refused = 0;
    for (const libraryId of collection.libraries) {
      try {
        libraries.push(await exportLibrary.callAsync({ libraryId }));
      } catch (error) {
        console.error(error);
        refused += 1;
      }
    }
    if (!libraries.length) {
      snackbar({ text: t('libraryFiles.nothingToDownload') });
      return;
    }
    await downloadLibraryFile({ name: collection.name, collection, libraries });
    if (refused) snackbar({ text: t('libraryFiles.someLeftOut', { count: refused }, refused) });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  } finally {
    downloading.value = false;
  }
}

async function subscribe(value) {
  loading.value = true;
  try {
    await Meteor.users.subscribeToLibraryCollection.callAsync({
      libraryCollectionId: route.params.id,
      subscribe: value,
    });
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
}

function editLibraryCollection() {
  dialogStackStore.pushDialogStack({
    component: 'library-collection-edit-dialog',
    elementId: 'library-collection-edit-button',
    data: { _id: route.params.id },
  });
}

function back() {
  return window.history.length > 2 ? router.back() : router.push('/library');
}
</script>

<style lang="css" scoped>

</style>
