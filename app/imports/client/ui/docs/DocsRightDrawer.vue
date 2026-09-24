<template>
  <v-navigation-drawer
    v-if="editing"
    v-model="drawer"
    location="right"
  >
    <tree-node-list
      :key="refreshTree"
      :children="docs"
      :organize="true"
      :selected-node="undefined"
      :root="{collection: 'docs', id: 'DDDDDDDDDDDDDDDDD'}"
      group="docs"
      @move-within-root="moveWithinRoot"
      @selected="selected"
    />
  </v-navigation-drawer>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { autorun } from 'vue-meteor-tracker';
import { Session } from 'meteor/session';

import Docs, { organizeDoc } from '/imports/api/docs/Docs';
import { docsToForest } from '/imports/api/parenting/parentingFunctions';
import TreeNodeList from '/imports/client/ui/components/tree/TreeNodeList.vue';
import { useAppStore } from '/imports/client/ui/piniaAppStore';

const appStore = useAppStore();

const router = useRouter();

const refreshTree = ref(0);

const drawer = computed({
  get() {
    return appStore.rightDrawer;
  },
  set(value) {
    appStore.setRightDrawer(value);
  }
});

const editing = autorun(() => Session.get('editingDocs')).result;

const docs = autorun(() => {
  const docsList = Docs.find({ removed: { $ne: true } }, { sort: { left: 1 } }).fetch();
  return docsToForest(docsList);
}).result;

function selected(docId) {
  const doc = Docs.findOne(docId);
  if (!doc) return;
  router.push(doc.href);
}

async function moveWithinRoot({ doc, newPosition }) {
  try {
    await organizeDoc.callAsync({
      docId: doc._id,
      newPosition,
    });
  } catch (error) {
    console.error(error);
  }
}
</script>

<style lang="css" scoped>
</style>
