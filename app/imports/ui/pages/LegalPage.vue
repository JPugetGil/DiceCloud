<template>
  <v-container
    class="py-6"
    style="max-width: 800px;"
  >
    <!-- Shown until the instance's operator and contact are in the settings -->
    <v-alert
      v-if="!configured"
      type="warning"
      variant="tonal"
      class="mb-6"
      data-id="legal-not-configured"
    >
      {{ $t('legal.notConfigured') }}
    </v-alert>
    <markdown-text :markdown="markdown" />
  </v-container>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Meteor } from 'meteor/meteor';
import MarkdownText from '/imports/ui/components/MarkdownText.vue';
import privacyPolicy from '/imports/ui/legal/privacyPolicy';
import termsOfService from '/imports/ui/legal/termsOfService';

const props = defineProps({
  // 'privacy' or 'terms'
  document: {
    type: String,
    required: true,
  },
});

const documents = {
  privacy: privacyPolicy,
  terms: termsOfService,
};

// Who runs this instance and how to reach them, from the settings:
// { "public": { "legal": { "operator": "…", "contactEmail": "…" } } }
const { operator, contactEmail } = Meteor.settings.public?.legal || {};
const configured = !!(operator && contactEmail);

const { locale } = useI18n();

const markdown = computed(() => {
  const document = documents[props.document];
  const write = document[locale.value] || document.en;
  return write({ operator, contactEmail });
});
</script>
