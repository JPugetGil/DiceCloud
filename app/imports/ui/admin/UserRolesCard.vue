<template>
  <v-card data-id="user-roles">
    <v-card-title>
      {{ $t('admin.userRoles') }}
    </v-card-title>
    <v-card-text>
      <p class="mb-4 text-medium-emphasis mt-0">
        {{ $t('admin.userRolesHint', {
          playerCharacters: ROLE_PERMISSIONS.player.characterLimit,
          playerStorage: prettyBytes(ROLE_PERMISSIONS.player.fileStorageLimit),
          activePlayerCharacters: ROLE_PERMISSIONS.activePlayer.characterLimit,
          activePlayerStorage: prettyBytes(ROLE_PERMISSIONS.activePlayer.fileStorageLimit),
          adminStorage: prettyBytes(ROLE_PERMISSIONS.admin.fileStorageLimit),
        }) }}
      </p>
      <v-text-field
        v-model="search"
        :label="$t('admin.searchUsers')"
        prepend-inner-icon="mdi-magnify"
        variant="outlined"
        density="compact"
        clearable
        hide-details
        :loading="loading"
        @update:model-value="debouncedRefresh"
      />
      <v-alert
        v-if="error"
        type="error"
        class="mt-4"
      >
        {{ error }}
      </v-alert>
      <v-table class="mt-4">
        <thead>
          <tr>
            <th>{{ $t('admin.user') }}</th>
            <th>{{ $t('admin.characters') }}</th>
            <th>{{ $t('admin.storage') }}</th>
            <th>{{ $t('admin.role') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user._id"
            :data-id="`user-${user._id}`"
          >
            <td>
              <div>{{ user.username || user._id }}</div>
              <div class="text-body-small text-medium-emphasis">
                {{ user.email }}
              </div>
            </td>
            <td :class="{ 'text-error': overCharacterLimit(user) }">
              {{ formatCharacters(user) }}
              <v-icon
                v-if="overCharacterLimit(user)"
                size="small"
                icon="mdi-alert-outline"
                :aria-label="$t('admin.overLimit')"
                :title="$t('admin.overLimit')"
              />
            </td>
            <td :class="{ 'text-error': overStorageLimit(user) }">
              {{ formatStorage(user) }}
              <v-icon
                v-if="overStorageLimit(user)"
                size="small"
                icon="mdi-alert-outline"
                :aria-label="$t('admin.overLimit')"
                :title="$t('admin.overLimit')"
              />
            </td>
            <td style="min-width: 180px;">
              <v-select
                :model-value="user.role"
                :items="roleItems"
                :label="$t('admin.role')"
                :hint="user._id === currentUserId ? $t('admin.cantChangeOwnRole') : undefined"
                :persistent-hint="user._id === currentUserId"
                :disabled="user._id === currentUserId"
                :loading="savingUserId === user._id"
                variant="outlined"
                density="compact"
                single-line
                :hide-details="user._id !== currentUserId"
                @update:model-value="role => setRole(user, role)"
              />
            </td>
          </tr>
          <tr v-if="!loading && !users.length">
            <td colspan="4">
              {{ $t('admin.noUsersFound') }}
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { debounce } from 'lodash';
import prettyBytes from 'pretty-bytes';
import { useI18n } from 'vue-i18n';
import searchUsers from '/imports/api/users/methods/searchUsers';
import setUserRole from '/imports/api/users/methods/setUserRole';
import { ROLE_ORDER, ROLE_PERMISSIONS } from '/imports/api/users/roles';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';

const { t } = useI18n();

const search = ref('');
const users = ref([]);
const loading = ref(false);
const error = ref(undefined);
const savingUserId = ref(undefined);

const currentUserId = autorun(() => Meteor.userId()).result;

const roleItems = computed(() => ROLE_ORDER.map(role => ({
  title: t(`roles.${role}`),
  value: role,
})));

function overCharacterLimit(user) {
  return user.characterCount > ROLE_PERMISSIONS[user.role].characterLimit;
}

function overStorageLimit(user) {
  return user.fileStorageUsed > ROLE_PERMISSIONS[user.role].fileStorageLimit;
}

function formatCharacters(user) {
  const { characterLimit } = ROLE_PERMISSIONS[user.role];
  if (characterLimit === Infinity) return user.characterCount;
  return `${user.characterCount} / ${characterLimit}`;
}

function formatStorage(user) {
  const { fileStorageLimit } = ROLE_PERMISSIONS[user.role];
  return `${prettyBytes(user.fileStorageUsed)} / ${prettyBytes(fileStorageLimit)}`;
}

// Searches can finish out of order, only the latest one is shown
let latestSearch = 0;
async function refresh() {
  const thisSearch = ++latestSearch;
  loading.value = true;
  try {
    const result = await searchUsers.callAsync({ search: search.value || undefined });
    if (thisSearch !== latestSearch) return;
    users.value = result;
    error.value = undefined;
  } catch (e) {
    if (thisSearch !== latestSearch) return;
    error.value = e.reason || e.message;
  } finally {
    if (thisSearch === latestSearch) loading.value = false;
  }
}
const debouncedRefresh = debounce(refresh, 300);

async function setRole(user, role) {
  if (role === user.role) return;
  savingUserId.value = user._id;
  try {
    await setUserRole.callAsync({ userId: user._id, role });
    user.role = role;
    snackbar({
      text: t('admin.roleChanged', {
        user: user.username || user._id,
        role: t(`roles.${role}`),
      }),
    });
  } catch (e) {
    console.error(e);
    snackbar({ text: e.reason || e.message });
  } finally {
    savingUserId.value = undefined;
  }
}

onMounted(refresh);
</script>
