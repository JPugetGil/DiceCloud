<template>
  <!--
    The licence of a library's content, which its owner states; what is copied
    from the library inherits it (a party board's monster shows it)
  -->
  <div
    class="mb-4"
    data-id="library-license-fields"
  >
    <smart-select
      :label="$t('library.license')"
      :items="licenseItems"
      :model-value="model.license || 'none'"
      :debounce-time="0"
      :disabled="!isOwner"
      :hint="hint"
      persistent-hint
      data-id="library-license"
      @change="(value, ack) => setLicense({ license: value === 'none' ? undefined : value, licenseNote: model.licenseNote }, ack)"
    />
    <text-area
      v-if="model.license === 'other-open' || model.licenseNote"
      class="mt-4"
      :label="$t('library.licenseNote')"
      :hint="$t('library.licenseNoteHint')"
      persistent-hint
      :model-value="model.licenseNote"
      :disabled="!isOwner"
      data-id="library-license-note"
      @change="(value, ack) => setLicense({ license: model.license, licenseNote: value }, ack)"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { LIBRARY_LICENSES, isSrdLicense, licenseLabel } from '/imports/api/library/libraryLicense';
import { setLibraryLicense } from '/imports/api/library/methods/libraryLicenseMethods';

const props = defineProps({
  // The library
  model: {
    type: Object,
    required: true,
  },
  isOwner: Boolean,
});

const { t } = useI18n();

const licenseItems = computed(() => [
  { title: t('library.licenses.none'), value: 'none' },
  ...LIBRARY_LICENSES.map(license => ({ title: licenseLabel(license, t), value: license })),
]);

// What the chosen licence asks of the library, and who may change it
const hint = computed(() => {
  if (!props.isOwner) return t('library.licenseOwnerOnly');
  if (isSrdLicense(props.model.license)) return t('library.licenseSrdHint');
  return t('library.licenseHint');
});

async function setLicense({ license, licenseNote }, ack) {
  try {
    await setLibraryLicense.callAsync({
      _id: props.model._id,
      ...license && { license },
      ...licenseNote?.trim() && { licenseNote },
    });
    ack();
  } catch (error) {
    ack(error?.reason || error);
  }
}
</script>
