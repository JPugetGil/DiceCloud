<template>
  <v-container class="documentation">
    <v-row justify="center">
      <v-col
        cols="12"
        lg="8"
      >
        <v-fade-transition mode="out-in">
          <v-card
            v-if="doc"
            :key="path"
          >
            <v-card-text>
              <markdown-text
                :markdown="doc"
                @click="mdClick"
              />
            </v-card-text>
          </v-card>
          <v-progress-circular
            v-else-if="!docsReady"
            indeterminate
            color="primary"
            size="32"
          />
          <v-card v-else-if="!doc">
            <v-card-title>
              {{ $t('docs.helpNotFound', { title }) }}
            </v-card-title>
          </v-card>
        </v-fade-transition>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup>
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MarkdownText from '/imports/client/ui/components/MarkdownText.vue';
import Docs from '/imports/api/docs/Docs';
import { expandRootUrl } from '/imports/api/docs/docUrls';
import { propsByDocsPath } from '/imports/constants/PROPERTIES';
import { autorun, subscribe } from 'vue-meteor-tracker';
import { useAppStore } from '/imports/client/ui/piniaAppStore';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const appStore = useAppStore();

const route = useRoute();
const router = useRouter();


const path = computed(() => route.params.docPath || 'docs');

const prop = computed(() => propsByDocsPath.get(path.value));

const title = computed(() => {
  if (prop.value) {
    return prop.value.name + ' Docs';
  } else {
    const titleCase = path.value.replace(
      /(\w*)(\W+)/g,
      function (txt, word) {
        return word.charAt(0).toUpperCase() + word.substring(1).toLowerCase() + ' ';
      }
    );
    return titleCase || t('pageTitle.docs');
  }
});

const { ready: docsReady } = subscribe(() => ['docs', path.value]);

const doc = autorun(() => {
  const document = Docs.findOne(path.value);
  return document && expandRootUrl(document.description);
}).result;

watch(title, (value) => {
  appStore.setPageTitle(value);
}, { immediate: true });

function mdClick(e) {
  const target = e.target || e.srcElement;
  const href = target && target.href;
  if (!href) return;
  const targetPath = href.split('/docs/')[1];
  if (!targetPath) return;
  e.preventDefault();
  router.push('/docs/' + targetPath);
}
</script>
