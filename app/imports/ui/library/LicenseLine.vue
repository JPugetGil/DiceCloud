<template>
  <!-- A library's licence, in one line: an SRD's leads to its attribution on the About page -->
  <div
    v-if="label"
    class="license-line d-flex align-center flex-wrap ga-1 text-body-small text-medium-emphasis"
    data-id="license-line"
  >
    <v-icon
      size="small"
      aria-hidden="true"
    >
      mdi-license
    </v-icon>
    <router-link
      v-if="isSrdLicense(license)"
      :to="LICENSES_ROUTE"
      class="license-line__link"
      data-id="license-link"
    >
      {{ label }}
    </router-link>
    <span v-else>{{ label }}</span>
    <span
      v-if="note"
      class="w-100"
    >{{ note }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { LICENSES_ROUTE, isSrdLicense, licenseLabel } from '/imports/api/library/libraryLicense';

const props = defineProps({
  license: {
    type: String,
    default: undefined,
  },
  // Another open licence's name and the notice it asks for, when shown in full
  note: {
    type: String,
    default: undefined,
  },
});

const { t } = useI18n();
const label = computed(() => licenseLabel(props.license, t));
</script>

<style scoped>
.license-line__link {
  color: inherit;
}
</style>
