<template>
  <v-row
    justify="center"
    class="doc-viewer"
  >
    <!--
      Content column (title, description, then the child docs) beside a table
      of contents that stays in view on wide screens; on narrow ones the table
      of contents comes first. It used to float inside the text, which left a
      gap before the child docs whenever the introduction was shorter than the
      list.
    -->
    <v-col
      v-if="hasContents"
      cols="12"
      md="4"
      lg="3"
      class="pt-0 order-md-last"
    >
      <v-card class="sibling-list">
        <v-list :density="siblingDocs.length > 5 ? 'compact' : undefined">
          <doc-list-item
            v-for="sibling in siblingDocs"
            :key="sibling._id"
            :doc="sibling"
            :icon="siblingHasIcon"
          />
        </v-list>
      </v-card>
    </v-col>
    <v-col
      v-bind="hasContents ? { md: 8, lg: 7 } : { lg: 10 }"
      cols="12"
      class="pt-0"
    >
      <v-fade-transition mode="out-in">
        <div
          :key="doc && doc.name || 'Documentation Home'"
          class="d-flex align-center mb-4"
        >
          <v-avatar
            v-if="(doc && doc.icon) || (!doc)"
            size="56"
          >
            <svg-icon
              v-if="doc && doc.icon"
              large
              :shape="doc.icon.shape"
            />
            <v-icon
              v-else-if="!doc"
              size="large"
            >
              mdi-home
            </v-icon>
          </v-avatar>
          <h1
            v-if="doc"
          >
            {{ doc.name }}
          </h1>
          <h1
            v-else
          >
            Documentation
          </h1>
        </div>
      </v-fade-transition>
      <v-fade-transition mode="out-in">
        <markdown-text
          v-if="doc"
          :key="doc._id"
          :markdown="doc.description"
          @click="mdClick"
        />
      </v-fade-transition>
      <v-fade-transition
        mode="out-in"
        leave-absolute
        hide-on-leave
      >
        <v-row
          :key="doc && doc._id"
          class="mt-2"
        >
          <v-col
            v-for="child in childDocs"
            :key="child._id"
            cols="12"
            sm="6"
            :xl="hasContents ? 4 : 3"
          >
            <doc-card :doc="child" />
          </v-col>
        </v-row>
      </v-fade-transition>
    </v-col>
  </v-row>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import DocCard from '/imports/client/ui/docs/DocCard.vue';
import DocListItem from '/imports/client/ui/docs/DocListItem.vue';
import { find } from 'lodash';

const router = useRouter();

const props = defineProps({
  doc: {
    type: Object,
    default: undefined,
  },
  childDocs: {
    type: Array,
    required: true,
  },
  siblingDocs: {
    type: Array,
    required: true,
  },
});

// Without a table of contents the content spans the breadcrumbs' width
const hasContents = computed(() => props.siblingDocs.length > 1);

const siblingHasIcon = computed(() => {
  return !!find(props.siblingDocs, doc => doc.icon);
});

function mdClick(e) {
  const target = e.target || e.srcElement;
  const href = target && target.href;
  if (!href) return;
  const path = href.split('/docs/')[1];
  if (!path) return;
  e.preventDefault();
  router.push('/docs/' + path);
}
</script>

<style lang="css" scoped>
/* In view while the document scrolls, just under the app bar */
@media (min-width: 960px) {
  .sibling-list {
    position: sticky;
    top: calc(var(--v-layout-top, 64px) + 16px);
  }
}
</style>
