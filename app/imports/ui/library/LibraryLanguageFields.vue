<template>
  <!--
    The language of a library or a collection, which the community browser
    filters by (UX13); its owner sets it, else it is guessed. Admins also
    recommend it, which puts it first with a badge
  -->
  <div
    class="mb-4"
    data-id="library-language-fields"
  >
    <smart-select
      :label="$t('library.language')"
      :items="languageItems"
      :model-value="model.language || 'auto'"
      :debounce-time="0"
      :disabled="!canEdit"
      :hint="model.language ? undefined : $t('library.languageAutoHint')"
      persistent-hint
      data-id="library-language"
      @change="setLanguage"
    />
    <smart-switch
      v-if="permissions.canManageRoles"
      :model-value="!!model.recommended"
      :label="$t('library.recommendedSwitch')"
      :hint="$t('library.recommendedHint')"
      persistent-hint
      data-id="library-recommended"
      @change="setRecommended"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import libraryLanguage, { LIBRARY_LANGUAGES } from '/imports/api/library/libraryLanguage';
import { setLibraryLanguage, setLibraryRecommended } from '/imports/api/library/methods/libraryLanguageMethods';
import useUserRole from '/imports/ui/composables/useUserRole';

const props = defineProps({
  // 'libraries' or 'libraryCollections'
  collection: {
    type: String,
    required: true,
  },
  model: {
    type: Object,
    required: true,
  },
  canEdit: Boolean,
});

const { t } = useI18n();
const { permissions } = useUserRole();

// Without the field, the guess, which the select names
const guessed = computed(() => libraryLanguage({ ...props.model, language: undefined }));
const languageItems = computed(() => [
  {
    title: guessed.value
      ? t('library.languageAuto', { language: t(`languages.${guessed.value}`) })
      : t('library.languageUnknown'),
    value: 'auto',
  },
  ...LIBRARY_LANGUAGES.map(language => ({ title: t(`languages.${language}`), value: language })),
]);

async function setLanguage(value, ack) {
  try {
    await setLibraryLanguage.callAsync({
      collection: props.collection,
      _id: props.model._id,
      ...value !== 'auto' && { language: value },
    });
    ack();
  } catch (error) {
    ack(error);
  }
}

async function setRecommended(recommended, ack) {
  try {
    await setLibraryRecommended.callAsync({
      collection: props.collection, _id: props.model._id, recommended: !!recommended,
    });
    ack();
  } catch (error) {
    ack(error);
  }
}
</script>
