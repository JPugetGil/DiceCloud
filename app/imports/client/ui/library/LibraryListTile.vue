<template>
  <v-list-item
    v-bind="$attrs"
    :class="(isSelected || selectedByCollection) && !disabled && 'text-primary v-list-item--active'"
    :to="selection ? undefined : to"
    @click="singleSelect && $emit('select')"
  >
    <template #prepend>
      <v-checkbox
        v-if="selection && !singleSelect"
        :disabled="disabled"
        :model-value="disabled || isSelected"
        :false-icon="selectedByCollection ? 'mdi-checkbox-intermediate' : undefined"
        @update:model-value="e => $emit('select', e)"
        @click.stop
      />
      <v-avatar v-else>
        <shared-icon :model="model" />
      </v-avatar>
    </template>

    <v-list-item-title>
      {{ model.name }}
    </v-list-item-title>
  </v-list-item>
</template>

<script setup>
import SharedIcon from '/imports/client/ui/components/SharedIcon.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
  selection: Boolean,
  singleSelect: Boolean,
  isSelected: Boolean,
  selectedByCollection: Boolean,
  disabled: Boolean,
  to: {
    type: Object,
    required: true,
  },
});

defineEmits(['select']);
</script>
