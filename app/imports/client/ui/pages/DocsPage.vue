<template>
  <v-container class="documentation">
    <v-row
      justify="center"
    >
      <v-col
        cols="12"
        lg="10"
      >
        <doc-breadcrumbs :doc="doc" />
      </v-col>
    </v-row>
    <v-fade-transition mode="out-in">
      <v-progress-circular
        v-if="!ready"
        key="loading"
        indeterminate
        color="primary"
        size="32"
      />
      <v-row
        v-else-if="docNotFound"
        key="failed"
        justify="center"
      >
        <v-col
          cols="12"
          md="8"
        >
          <h1>{{ $t('docs.notFound') }}</h1>
        </v-col>
      </v-row>
      <doc-edit-form
        v-else-if="editing"
        key="editing"
        :doc="doc"
        :child-docs="childDocs"
      />
      <doc-viewer
        v-else
        key="viewing"
        :doc="doc"
        :child-docs="childDocs"
        :sibling-docs="siblingDocs"
      />
    </v-fade-transition>
  </v-container>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { autorun, subscribe } from 'vue-meteor-tracker';
import Docs from '/imports/api/docs/Docs';
import DocEditForm from '/imports/client/ui/docs/DocEditForm.vue';
import DocViewer from '/imports/client/ui/docs/DocViewer.vue';
import DocBreadcrumbs from '/imports/client/ui/docs/DocBreadcrumbs.vue';
import { Session } from 'meteor/session';
import { useAppStore } from '/imports/client/ui/piniaAppStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const appStore = useAppStore();

const route = useRoute();

const docNotFound = ref(false);

const { ready: ready } = subscribe(() => ['docs']);

const path = computed(() => {
  const p = route.params.docPath;
  return typeof p === 'string' ? p : '';
});

const docs = autorun(() => {
  const result = [];
  docNotFound.value = false;
  const p = path.value;
  if (!p) {
    return result;
  }
  let currentDoc = undefined;
  p.split('/').forEach(urlName => {
    currentDoc = Docs.findOne({
      urlName, 'parentId': currentDoc?._id,
      removed: { $ne: true },
    });
    if (currentDoc) {
      result.push(currentDoc);
    } else {
      docNotFound.value = true;
    }
  });
  return result;
}).result;

const doc = computed(() => {
  if (!docs.value?.length) return;
  return docs.value[docs.value.length - 1];
});

const title = computed(() => {
  if (doc.value) {
    return doc.value.name;
  } else if (docNotFound.value) {
    return t('pageTitle.docNotFound');
  } else {
    return t('pageTitle.documentation');
  }
});

const childDocs = autorun(() => {
  if (!doc.value) return Docs.find({
    'parentId': undefined,
    removed: { $ne: true },
  }, {
    sort: { left: 1 }
  });
  return Docs.find({
    'parentId': doc.value._id,
    removed: { $ne: true },
  }, {
    sort: { left: 1 }
  });
}).result;

const siblingDocs = autorun(() => {
  if (!doc.value) return [];
  return Docs.find({
    'parentId': doc.value.parentId,
    removed: { $ne: true },
  }, {
    sort: { left: 1 }
  });
}).result;

const editing = autorun(() => {
  return Session.get('editingDocs');
}).result;

watch(title, (value) => {
  appStore.setPageTitle(value);
}, { immediate: true });
</script>

<style>
.documentation .fade-transition-enter-active {
  transition: all .25s linear !important;
}
.documentation .fade-transition-leave-active {
  transition: all .1s linear !important;
}
</style>