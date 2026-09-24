<template>
  <dialog-base>
    <template #toolbar>
      <v-icon class="mr-2">
        mdi-help
      </v-icon>
      <v-toolbar-title>
        Help: {{ title }}
      </v-toolbar-title>
    </template>
    <div>
      <v-progress-circular
        v-if="!doc && !isDocsReady"
        indeterminate
        color="primary"
        size="32"
      />
      <div v-else-if="!doc">
        Help document not found for {{ title }}
      </div>
      <markdown-text
        v-else
        :markdown="doc"
        @click="linkClick"
      />
    </div>
    <template #actions>
      <v-spacer />
      <v-btn
        variant="text"
        @click="dialogStackStore.popDialogStack()"
      >
        Close
      </v-btn>
    </template>
  </dialog-base>
</template>

<script setup>
import { computed } from 'vue';
import { autorun, subscribe } from 'vue-meteor-tracker';

import DialogBase from '/imports/client/ui/dialogStack/DialogBase.vue';
import { propsByDocsPath } from '/imports/constants/PROPERTIES';
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import Docs from '/imports/api/docs/Docs';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  path: {
    type: String,
    required: true,
  }
});


const prop = computed(() => propsByDocsPath.get(props.path));

const title = computed(() => {
  if (prop.value) {
    return prop.value.name;
  } else {
    const titleCase = props.path.replace(
      /(\w*)(\W+)/g,
      function (txt, word) {
        return word.charAt(0).toUpperCase() + word.substr(1).toLowerCase() + ' ';
      }
    );
    return titleCase || 'Character Sheet';
  }
});

const { ready: docsReady } = subscribe(() => ['docs', props.path]);
const isDocsReady = computed(() => docsReady.value);

const doc = autorun(() => {
  const d = Docs.findOne({href: '/docs/' + props.path});
  return d && d.description;
}).result;

function linkClick(e) {
  const target = e.target || e.srcElement;
  const href = target && target.href;
  if (!href) return;
  const path = href.split('/docs/')[1];
  if (!path) return;
  e.preventDefault();
  target.dataset.id = path;
  dialogStackStore.pushDialogStack({
    component: 'help-dialog',
    elementId: path,
    data: {
      path,
    },
  });
}
</script>

<style lang="css" scoped>

</style>
