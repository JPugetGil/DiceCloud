<template>
  <dialog-base>
    <template #toolbar>
      <v-toolbar-title>
        {{ $t('common.sharing') }}
      </v-toolbar-title>
    </template>
    <div v-if="model">
      <smart-select
        :label="$t('sharing.whoCanView')"
        :items="[
          {title: $t('sharing.onlyShared'), value: 'false'},
          {title: $t('sharing.anyoneWithLink'), value: 'true'}
        ]"
        :value="!!model.public + ''"
        @change="(value, ack) => setSheetPublic({value, ack})"
      />
      <smart-select
        v-if="docRef.collection === 'libraries'"
        :label="$t('sharing.whoCanCopy')"
        :items="[
          {title: $t('sharing.onlyEditors'), value: 'false'},
          {title: $t('sharing.anyoneReader'), value: 'true'}
        ]"
        :value="!!model.readersCanCopy + ''"
        @change="(value, ack) => setReadersCanCopy({value, ack})"
      />
      <text-field
        v-if="model.public && docRef.collection === 'libraries'"
        readonly
        :label="$t('sharing.link')"
        :value="locationOrigin + router.resolve({
          name: 'singleLibrary',
          params: { id: model._id },
        }).href"
      />
      <div class="d-flex flex-1-1">
        <text-field
          :label="$t('auth.usernameOrEmail')"
          :value="userSearched"
          :debounce-time="300"
          @change="(value, ack) => getUser({value, ack})"
        />
        <v-btn
          class="ml-2 mt-2"
          :disabled="userFoundState !== 'found'"
          @click="updateSharing(userId, 'reader')"
        >
          {{ $t('common.share') }}
        </v-btn>
      </div>
      <v-list
        two-lines
        class="sharedWith"
      >
        <v-list-item
          v-for="user in sharedUsers"
          :key="user._id"
        >
          <v-list-item-title>
            {{ user.username || user._id }}
          </v-list-item-title>
          <v-list-item-subtitle>
            {{ user.permission === 'writer' ? $t('sharing.canEdit') : $t('sharing.canView') }}
          </v-list-item-subtitle>

          <template #append>
            <v-menu
              location="bottom left"

              :data-id="'menu-' + user._id"
            >
              <template #activator="{ props: activatorProps }">
                <v-btn
                  variant="text"
                  icon
                  v-bind="activatorProps"
                >
                  <v-icon>mdi-dots-vertical</v-icon>
                </v-btn>
              </template>
              <v-list>
                <v-list-item
                  v-if="user.permission === 'reader'"
                  @click="updateSharing(user._id, 'writer')"
                >
                  <template #prepend>
                    <v-icon>mdi-pencil</v-icon>
                  </template>
                  <v-list-item-title>{{ $t('sharing.canEdit') }}</v-list-item-title>
                </v-list-item>
                <v-list-item
                  v-if="user.permission === 'writer'"
                  @click="updateSharing(user._id, 'reader')"
                >
                  <template #prepend>
                    <v-icon>mdi-eye</v-icon>
                  </template>
                  <v-list-item-title>{{ $t('sharing.viewOnly') }}</v-list-item-title>
                </v-list-item>
                <v-list-item
                  v-if="user.permission === 'writer'"
                  @click="makeOwner(user)"
                >
                  <template #prepend>
                    <v-icon>mdi-signature</v-icon>
                  </template>
                  <v-list-item-title>{{ $t('sharing.transferOwnership') }}</v-list-item-title>
                </v-list-item>
                <v-list-item @click="updateSharing(user._id, 'none')">
                  <template #prepend>
                    <v-icon>mdi-delete</v-icon>
                  </template>
                  <v-list-item-title>{{ $t('common.remove') }}</v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </template>
        </v-list-item>
      </v-list>
      <v-fade-transition>
        <v-progress-circular
          v-if="!userPublicProfilesReady"
          indeterminate
        />
      </v-fade-transition>
    </div>
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        {{ $t('common.done') }}
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup lang="js">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { getCollectionByName } from '/imports/api/parenting/parentingFunctions';
import {
  setPublic,
  setReadersCanCopy,
  updateUserSharePermissions
} from '/imports/api/sharing/sharing';
import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  docRef: {
    type: Object,
    required: true,
  },
});

const router = useRouter();

const locationOrigin = window.location.origin;

const userSearched = ref(undefined);
const userFoundState = ref('idle');
const userId = ref(undefined);

const model = autorun(() => {
  if (!props.docRef || !props.docRef.id) return;
  // Read minimongo directly: a reactive computed cannot await fetchDocByRef
  return getCollectionByName(props.docRef.collection).findOne(props.docRef.id);
}).result;

const sharedUsers = autorun(() => {
  if (!model.value) return [];
  let users = [];
  Meteor.users.find({ _id: { $in: model.value.readers || [] } }).forEach(user => {
    user.permission = 'reader';
    users.push(user);
  });
  Meteor.users.find({ _id: { $in: model.value.writers || [] } }).forEach(user => {
    user.permission = 'writer';
    users.push(user);
  });
  users.sort(function (a, b) {
    if (a.username < b.username) return -1;
    if (a.username > b.username) return 1;
    return 0;
  });
  return users;
}).result;

const { ready: userPublicProfilesReady } = subscribe(() => {
  if (!model.value) return false;
  return ['userPublicProfiles', [model.value.owner, ...(model.value.writers || []), ...(model.value.readers || [])]];
});

async function setSheetPublic({ value, ack }) {
  try {
    await setPublic.callAsync({
      docRef: props.docRef,
      isPublic: value === 'true',
    });
    ack();
  } catch (error) {
    ack(error && error.reason || error);
  }
}


async function getUser({ value, ack }) {
  userSearched.value = value;
  if (!value) {
    userFoundState.value = 'idle';
    ack();
    return;
  }
  try {
    const result = await Meteor.users.findUserByUsernameOrEmail.callAsync({
      usernameOrEmail: value
    });
    userId.value = result;
    if (result) {
      if (result === model.value.owner) {
        userFoundState.value = 'failed';
        ack(t('sharing.alreadyOwner'));
      } else {
        userFoundState.value = 'found';
        ack();
      }
    } else {
      userFoundState.value = 'notFound';
      ack(t('sharing.userNotFound'));
    }
  } catch (error) {
    ack(error && error.reason || error);
    userFoundState.value = 'failed';
  }
}

async function updateSharing(userId, role) {
  await updateUserSharePermissions.callAsync({
    docRef: props.docRef,
    userId,
    role,
  });
}

function makeOwner(user) {
  dialogStackStore.pushDialogStack({
    component: 'transfer-ownership-dialog',
    elementId: 'menu-' + user._id,
    data: {
      docRef: props.docRef,
      user,
    },
  });
}
</script>

<style lang="css" scoped>

</style>
