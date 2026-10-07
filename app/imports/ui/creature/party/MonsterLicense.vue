<template>
  <!-- The licence of the bestiary a monster was copied from (its template's library) -->
  <license-line
    v-if="license"
    :license="license"
    data-id="monster-license"
  />
</template>

<script setup>
import { autorun } from 'vue-meteor-tracker';
import LibraryNodes from '/imports/api/library/LibraryNodes';
import Libraries from '/imports/api/library/Libraries';
import LicenseLine from '/imports/ui/library/LicenseLine.vue';

/**
 * Its game master's: the board and the sheet publish them the template and
 * its library (partyBoard, singleCharacter)
 */
const props = defineProps({
  templateId: {
    type: String,
    default: undefined,
  },
});

const license = autorun(() => {
  const libraryId = props.templateId && LibraryNodes.findOne(props.templateId, { fields: { root: 1 } })?.root?.id;
  return libraryId && Libraries.findOne(libraryId, { fields: { license: 1 } })?.license;
}).result;
</script>
