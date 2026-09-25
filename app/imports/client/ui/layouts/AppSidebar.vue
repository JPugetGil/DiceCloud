<template>
  <div class="sidebar">
    <div
      v-if="!signedIn"
      class="d-flex flex-1-1 justify-center"
    >
      <v-btn
        variant="text"
        to="/sign-in"
      >
        {{ $t('nav.signIn') }}
      </v-btn>
    </div>
    <v-list
      nav
      class="links"
    >
      <v-list-item v-if="signedIn">
        <v-list-item-title>
          {{ userName }}
        </v-list-item-title>

        <template #append>
          <v-tooltip location="bottom">
            <template #activator="{ props }">
              <v-btn
                variant="text"
                icon
                to="/account"
                v-bind="props"
              >
                <v-icon>mdi-cog</v-icon>
              </v-btn>
            </template>
            <span>{{ $t('nav.accountSettings') }}</span>
          </v-tooltip>
        </template>
      </v-list-item>

      <v-list-item
        v-for="(link, i) in links"
        :key="i"
        :to="link.to"
        :href="link.href"
        :target="link.href ? '_blank': undefined"
      >
        <template #prepend>
          <v-icon>{{ link.icon }}</v-icon>
        </template>
        <v-list-item-title>
          {{ link.title }}
        </v-list-item-title>
        <template
          v-if="link.href"
          #append
        >
          <v-icon>mdi-open-in-new</v-icon>
        </template>
      </v-list-item>
      <v-divider />
    </v-list>
    <creature-folder-list
      v-if="signedIn"
      dense
      :creatures="CreaturesWithNoParty"
      :folders="folders"
    />
  </div>
</template>

<script setup lang="js">
import { computed } from 'vue';
import { subscribe, autorun } from 'vue-meteor-tracker';
import { Meteor } from 'meteor/meteor';
import Creatures from '/imports/api/creature/creatures/Creatures';
import CreatureFolders from '/imports/api/creature/creatureFolders/CreatureFolders';
import CreatureFolderList from '/imports/client/ui/creature/creatureList/CreatureFolderList.vue';
import getCreatureUrlName from '/imports/api/creature/creatures/getCreatureUrlName';
import { uniq, flatten } from 'lodash';
import { useI18n } from 'vue-i18n';

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

// computed, not autorun: the titles follow the language
const links = computed(() => {
  let isLoggedIn = !!signedIn.value;
  let links = [
    { title: t('nav.home'), icon: 'mdi-home', to: '/' },
    { title: t('nav.characters'), icon: 'mdi-account-group', to: '/character-list', requireLogin: true },
    { title: t('nav.library'), icon: 'mdi-library-shelves', to: '/library', requireLogin: true },
    //{ title: 'Friends', icon: 'mdi-account-multiple', to: '/friends', requireLogin: true },
    { title: t('nav.files'), icon: 'mdi-file-multiple', to: '/my-files', requireLogin: true, },
    { title: t('nav.documentation'), icon: 'mdi-book-open-variant', to: '/docs' },
    { title: t('nav.discord'), icon: 'mdi-discord', to: '/discord' },
    { title: t('nav.about'), icon: 'mdi-sign-text', to: '/about' },
    { title: t('nav.github'), icon: 'mdi-github', href: 'https://github.com/ThaumRystra/DiceCloud/' },
  ];
  return links.filter(link => !link.requireLogin || isLoggedIn);
});

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
</script>

<style scoped>
.links .v-list-item:not(:last-child):not(:only-child) {
  margin-bottom: 4px;
}
</style>
