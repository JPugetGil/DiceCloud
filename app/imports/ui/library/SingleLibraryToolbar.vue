<template>
  <v-app-bar
    color="secondary"
    theme="dark"
  >
    <v-app-bar-nav-icon @click="toggleDrawer" />
    <v-btn
      variant="text"
      icon
      @click="back"
    >
      <v-icon>mdi-arrow-left</v-icon>
    </v-btn>
    <v-toolbar-title>
      {{ library && library.name }}
    </v-toolbar-title>
    <v-spacer />
    <div
      v-if="library && library.subscriberCount"
      class="mx-2 text-body-medium text-medium-emphasis d-none d-sm-block"
    >
      {{ $t('library.subscribers', { count: formatNumber(library.subscriberCount) }) }}
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
      v-if="canCopy"
      variant="text"
      icon
      :loading="downloading"
      :aria-label="$t('libraryFiles.download')"
      data-id="library-download-button"
      @click="download"
    >
      <v-icon>mdi-download</v-icon>
      <v-tooltip
        activator="parent"
        location="bottom"
        :text="$t('libraryFiles.download')"
      />
    </v-btn>
    <v-btn
      v-if="canEdit"
      variant="text"
      icon
      data-id="library-edit-button"
      @click="editLibrary(library._id)"
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
import { hasCopyPermission, hasDocEditPermission } from '/imports/api/sharing/sharingPermissions';
import { exportLibrary } from '/imports/api/library/methods/libraryFiles';
import { downloadLibraryFile } from '/imports/ui/library/libraryFiles';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import Libraries from '/imports/api/library/Libraries';
import formatter from '/imports/ui/utility/numberFormatter';
import { useAppStore } from '/imports/ui/stores/app';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

const route = useRoute();
const router = useRouter();

const loading = ref(false);

const toggleDrawer = () => appStore.toggleDrawer();

const library = autorun(() => Libraries.findOne(route.params.id)).result;

const subscribed = autorun(() => {
  const libraryId = route.params.id;
  const user = Meteor.user();
  return user?.subscribedLibraries?.includes(libraryId);
}).result;

const showSubscribeButton = autorun(() => {
  const user = Meteor.user();
  const lib = library.value;
  if (!user || !lib) return;
  const userId = user._id;
  if (user.subscribedLibraries?.includes(lib._id)) {
    return true;
  } else if (
    lib.readers?.includes(userId) ||
    lib.writers?.includes(userId) ||
    lib.owner === userId
  ) {
    return false;
  } else {
    return true;
  }
}).result;

const canEdit = autorun(() => hasDocEditPermission(library.value, Meteor.user())).result;

// Saving it as a file copies it: the library's readers only can if it lets them
const canCopy = autorun(() => hasCopyPermission(library.value, Meteor.user())).result;
const downloading = ref(false);

async function download() {
  downloading.value = true;
  try {
    const entry = await exportLibrary.callAsync({ libraryId: route.params.id });
    await downloadLibraryFile({ name: entry.library.name, libraries: [entry] });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message });
  } finally {
    downloading.value = false;
  }
}

const formatNumber = (num) => formatter.format(num);

const subscribe = async (value) => {
  loading.value = true;
  try {
    await Meteor.users.subscribeToLibrary.callAsync({
      libraryId: route.params.id,
      subscribe: value,
    });
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const editLibrary = () => {
  dialogStackStore.pushDialogStack({
    component: 'library-edit-dialog',
    elementId: 'library-edit-button',
    data: { _id: route.params.id },
  });
};

const back = () => {
  return window.history.length > 2 ? router.back() : router.push('/library');
};
</script>

<style lang="css" scoped>

</style>
