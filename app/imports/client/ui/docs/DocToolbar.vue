<template>
  <v-app-bar
    color="secondary"
    theme="dark"
    tabs
    extended
    density="compact"
  >
    <v-app-bar-nav-icon @click="toggleDrawer" />
    <v-toolbar-title>
      Documentation
    </v-toolbar-title>
    <v-spacer />
    <v-app-bar-nav-icon
      v-if="editing"
      @click="toggleRightDrawer"
    >
      <v-icon>mdi-file-tree</v-icon>
    </v-app-bar-nav-icon>
    <v-btn
      v-if="canEdit"
      variant="text"
      icon
      @click="toggleEdit"
    >
      <v-icon v-if="editing">
        mdi-check
      </v-icon>
      <v-icon v-else>
        mdi-pencil
      </v-icon>
    </v-btn>
  </v-app-bar>
</template>

<script setup>
import { Session } from 'meteor/session';
import { Meteor } from 'meteor/meteor';
import { autorun } from 'vue-meteor-tracker';
import { useAppStore } from '/imports/client/ui/piniaAppStore';

const appStore = useAppStore();


const editing = autorun(() => Session.get('editingDocs')).result;

const canEdit = autorun(() => {
  const user = Meteor.user();
  if (!user) return false;
  return user.roles?.includes('docsWriter');
}).result;

function toggleDrawer() {
  appStore.toggleDrawer();
}

function toggleRightDrawer() {
  appStore.toggleRightDrawer();
}

function toggleEdit() {
  if (!canEdit.value) return;
  Session.set('editingDocs', !Session.get('editingDocs'));
}
</script>
