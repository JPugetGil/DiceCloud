<template>
  <span class="d-flex align-center ga-2">
    <v-avatar
      v-bind="creature.color ? userColorProps(creature.color) : { color: creature.kind === 'monster' ? 'surface-variant' : 'primary-container' }"
      variant="flat"
      size="28"
    >
      <v-img
        v-if="creature.avatarPicture || creature.picture"
        :src="creature.avatarPicture || creature.picture"
        cover
        alt=""
      />
      <span
        v-else
        aria-hidden="true"
      >{{ (creature.name || '?')[0] }}</span>
    </v-avatar>
    <span>
      {{ creature.name || $t('targetPicker.unnamed') }}
      <span
        v-if="isActor"
        class="text-medium-emphasis"
      >{{ $t('targetPicker.meSuffix') }}</span>
    </span>
  </span>
</template>

<script setup>
import userColorProps from '/imports/ui/utility/userColor';

/** A creature in the target picker: its picture and its name, and "(me)" for the one that acts */
defineProps({
  creature: {
    type: Object,
    required: true,
  },
  isActor: Boolean,
});
</script>
