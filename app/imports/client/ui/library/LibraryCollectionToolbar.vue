<template>
  <v-app-bar
    color="secondary"
    theme="dark"
    tabs
    extended
    density="compact"
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
      {{ libraryCollection && libraryCollection.name }}
    </v-toolbar-title>
    <v-spacer />
    <v-btn
      v-if="showSubscribeButton"
      variant="text"
      :loading="loading"
      @click="subscribe(!subscribed)"
    >
      {{ subscribed ? 'Unsubscribe' : 'Subscribe' }}
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
    <template #extension>
      <v-spacer />
      <div
        v-if="libraryCollection && libraryCollection.subscriberCount"
        class="mx-4 text-medium-emphasis"
      >
        {{ formatNumber(libraryCollection.subscriberCount) }} subscribers
      </div>
    </template>
  </v-app-bar>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { hasDocEditPermission } from '/imports/api/sharing/sharingPermissions';
import LibraryCollections from '/imports/api/library/LibraryCollections';
import formatter from '/imports/client/ui/utility/numberFormatter';
import { useAppStore } from '/imports/client/ui/piniaAppStore';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

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
