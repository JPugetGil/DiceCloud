<template>
  <div class="sidebar">
    <router-link
      to="/"
      class="d-flex align-center ga-3 px-4 pt-4 pb-2 text-decoration-none text-high-emphasis"
    >
      <v-img
        src="/crown-dice-logo-cropped-transparent.png"
        alt=""
        width="32"
        height="32"
        class="flex-grow-0"
      />
      <span class="text-title-large">DiceCloud</span>
    </router-link>

    <div
      v-if="!signedIn"
      class="px-4 py-2"
    >
      <v-btn
        color="primary"
        variant="flat"
        block
        prepend-icon="mdi-login"
        to="/sign-in"
      >
        {{ $t('nav.signIn') }}
      </v-btn>
    </div>

    <v-list
      nav
      color="primary"
      class="links"
    >
      <v-list-item
        v-if="signedIn"
        class="mb-2"
        :title="userName"
        :subtitle="$t(`roles.${userRole}`)"
      >
        <template #prepend>
          <v-avatar
            color="primary-container"
            variant="flat"
            size="36"
          >
            {{ userInitial }}
          </v-avatar>
        </template>
        <template #append>
          <v-btn
            variant="text"
            icon
            size="small"
            to="/account"
            :aria-label="$t('nav.accountSettings')"
          >
            <v-icon>mdi-cog</v-icon>
            <v-tooltip
              activator="parent"
              location="bottom"
              :text="$t('nav.accountSettings')"
            />
          </v-btn>
        </template>
      </v-list-item>

      <v-list-item
        v-for="link in mainLinks"
        :key="link.to"
        :to="link.to"
        :prepend-icon="link.icon"
        :title="link.title"
      />
    </v-list>

    <template v-if="signedIn && hasCharacters">
      <v-divider class="mx-4" />
      <v-list-subheader class="px-6 pt-2">
        {{ $t('nav.characters') }}
      </v-list-subheader>
      <creature-folder-list
        dense
        nav
        :creatures="CreaturesWithNoParty"
        :folders="folders"
      />
    </template>

    <template v-if="signedIn && parties.length">
      <v-divider class="mx-4" />
      <v-list-subheader class="px-6 pt-2">
        {{ $t('nav.parties') }}
      </v-list-subheader>
      <v-list
        nav
        density="compact"
        color="primary"
        class="links"
        data-id="sidebar-parties"
      >
        <v-list-item
          v-for="party in parties"
          :key="party._id"
          :to="`/party/${party._id}`"
          prepend-icon="mdi-account-group-outline"
          :title="party.name || $t('party.untitled')"
        />
      </v-list>
    </template>

    <v-divider class="mx-4" />
    <v-list
      nav
      density="compact"
      color="primary"
      class="links"
    >
      <v-list-item
        v-for="link in resourceLinks"
        :key="link.to || link.href"
        :to="link.to"
        :href="link.href"
        :target="link.href ? '_blank': undefined"
        :prepend-icon="link.icon"
        :title="link.title"
        :append-icon="link.href ? 'mdi-open-in-new' : undefined"
      />
    </v-list>
  </div>
</template>

<script setup lang="js">
import { computed } from 'vue';
import { subscribe, autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureFolderList from '/imports/ui/creature/creatureList/CreatureFolderList.vue';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { uniq, flatten } from 'lodash';
import { useI18n } from 'vue-i18n';
import { getUserRole, ROLES } from '/imports/api/users/roles';

const { t } = useI18n();

const characterTransform = function (char) {
  char.url = `/character/${char._id}/${getCreatureUrlName(char)}`;
  char.initial = char.name && char.name[0] || '?';
  return char;
};

subscribe('characterList');

const signedIn = autorun(() => Meteor.userId()).result;

const userName = autorun(() => {
  let user = Meteor.user();
  return user && user.username || user && user._id;
}).result;

const userInitial = computed(() => (userName.value || '?')[0].toUpperCase());

const userRole = autorun(() => getUserRole(Meteor.user())).result;

// computed, not autorun: the titles follow the language
const mainLinks = computed(() => {
  let isLoggedIn = !!signedIn.value;
  let links = [
    { title: t('nav.home'), icon: 'mdi-home-outline', to: '/' },
    { title: t('nav.characters'), icon: 'mdi-account-group-outline', to: '/character-list', requireLogin: true },
    { title: t('nav.library'), icon: 'mdi-library-shelves', to: '/library', requireLogin: true },
    { title: t('nav.files'), icon: 'mdi-file-multiple-outline', to: '/my-files', requireLogin: true, },
    { title: t('nav.admin'), icon: 'mdi-shield-account-outline', to: '/admin', requireAdmin: true },
  ];
  return links.filter(link =>
    (!link.requireLogin || isLoggedIn) && (!link.requireAdmin || userRole.value === ROLES.admin)
  );
});

// Help, community and legal pages, below the characters
const resourceLinks = computed(() => [
  { title: t('nav.documentation'), icon: 'mdi-book-open-variant', to: '/docs' },
  { title: t('nav.discord'), icon: 'mdi-discord', to: '/discord' },
  { title: t('nav.about'), icon: 'mdi-information-outline', to: '/about' },
  { title: t('nav.privacy'), icon: 'mdi-shield-lock-outline', to: '/privacy' },
  { title: t('nav.terms'), icon: 'mdi-file-document-outline', to: '/terms' },
  { title: t('nav.github'), icon: 'mdi-github', href: 'https://github.com/JPugetGil/DiceCloud' },
]);

const folders = autorun(() => {
  const userId = Meteor.userId();
  let folders = CreatureFolders.find(
    { owner: userId, archived: { $ne: true } },
    { sort: { name: 1 } },
  ).map(folder => {
    folder.creatures = Creatures.find(
      {
        _id: { $in: folder.creatures || [] },
        $or: [{ readers: userId }, { writers: userId }, { owner: userId }],
      }, {
      sort: { name: 1 },
    }
    ).map(characterTransform);
    return folder;
  });
  folders = folders.filter(folder => !!folder.creatures.length);
  return folders;
}).result;

// The parties the user plays in; those they run are their own folders, above
const parties = autorun(() => CreatureFolders.find(
  { members: Meteor.userId() }, { sort: { name: 1 }, fields: { name: 1 } },
).fetch()).result;

const CreaturesWithNoParty = autorun(() => {
  var userId = Meteor.userId();
  var charArrays = CreatureFolders.find({ owner: userId }).map(p => p.creatures);
  var folderChars = uniq(flatten(charArrays));
  return Creatures.find(
    {
      _id: { $nin: folderChars },
      $or: [{ readers: userId }, { writers: userId }, { owner: userId }],
      type: 'pc',
    },
    { sort: { name: 1 } }
  ).map(characterTransform);
}).result;

const hasCharacters = computed(() =>
  !!(CreaturesWithNoParty.value?.length || folders.value?.length)
);
</script>

<style scoped>
.links .v-list-item:not(:last-child):not(:only-child) {
  margin-bottom: 2px;
}
</style>
