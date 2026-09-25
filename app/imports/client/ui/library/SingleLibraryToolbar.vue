<template>
  <v-app-bar
    color="secondary"
    theme="dark"
    :extended="smAndUp"
    :tabs="smAndUp"
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
      {{ library && library.name }}
    </v-toolbar-title>
    <v-spacer />
    <v-btn
      v-if="showSubscribeButton"
      variant="text"
      :loading="loading"
      @click="subscribe(!subscribed)"
    >
      {{ subscribed ? $t('library.unsubscribe') : $t('library.subscribe') }}
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
    <template #extension>
      <v-spacer />
      <div
        v-if="library && library.subscriberCount"
        class="mx-4 text-medium-emphasis"
      >
        {{ $t('library.subscribers', { count: formatNumber(library.subscriberCount) }) }}
      </div>
    </template>
  </v-app-bar>
</template>

<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import { hasDocEditPermission } from '/imports/api/sharing/sharingPermissions';
import Libraries from '/imports/api/library/Libraries';
import formatter from '/imports/client/ui/utility/numberFormatter';
import { useAppStore } from '/imports/client/ui/piniaAppStore';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const appStore = useAppStore();
const dialogStackStore = useDialogStackStore();

const route = useRoute();
const router = useRouter();
const { smAndUp } = useDisplay();

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
