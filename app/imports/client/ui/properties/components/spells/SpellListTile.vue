<template>
  <v-list-item
    class="spell"
    v-bind="$attrs"
    :disabled="disabled"
    v-on="hasClickListener ? {click} : {}"
  >
    <template #prepend>
      <v-avatar class="spell-avatar">
        <property-icon
          class="mr-2"
          :model="model"
          :color="model.color"
          :disabled="disabled"
        />
      </v-avatar>
    </template>

    <v-list-item-title>
      {{ title }}
    </v-list-item-title>
    <v-list-item-subtitle v-if="spellComponents">
      {{ spellComponents }}
    </v-list-item-subtitle>

    <template
      v-if="preparingSpells || showInfoButton"
      #append
    >
      <smart-checkbox
        v-if="preparingSpells"
        :value="model.prepared || model.alwaysPrepared"
        :disabled="model.alwaysPrepared || context.editPermission === false"
        @click.stop="() => {}"
        @change="setPrepared"
      />
      <v-btn
        v-else-if="showInfoButton"
        variant="text"
        icon
        class="info-icon"
        :disabled="disabled"
        :data-id="`spell-info-btn-${model._id}`"
        @click.stop="$emit('show-info')"
      >
        <v-icon>mdi-information</v-icon>
      </v-btn>
    </template>
  </v-list-item>
</template>

<script setup>
import { inject, computed, useAttrs } from 'vue';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';
import PROPERTIES from '/imports/constants/PROPERTIES';

const attrs = useAttrs();

const props = defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
  preparingSpells: Boolean,
  showInfoButton: Boolean,
  disabled: Boolean,
});

const emit = defineEmits(['show-info', 'click']);

const context = inject('context', {});

const hasClickListener = computed(() => {
  return !!attrs.onClick;
});

const spellComponents = computed(() => {
  let components = [];
  if (props.model.ritual) components.push('R');
  if (props.model.concentration) components.push('C');
  if (props.model.verbal) components.push('V');
  if (props.model.somatic) components.push('S');
  if (props.model.material) components.push(`M (${props.model.material})`);
  return components.join(', ');
});

const title = computed(() => {
  const model = props.model;
  if (!model) return;
  if (model.name) return model.name;
  const prop = PROPERTIES[model.type];
  return prop && prop.name;
});

function click(e) {
  emit('click', e);
}

async function setPrepared(val, ack) {
  try {
    await updateCreatureProperty.callAsync({
      _id: props.model._id,
      path: ['prepared'],
      value: val
    });
    ack?.();
  } catch (error) {
    ack?.(error);
  }
}
</script>

<style lang="css" scoped>
.spell-avatar {
  min-width: 32px;
}

.spell {
  background-color: inherit;
}

/* The light theme's red was forced here in both themes: 2.1:1 on dark cards */
.text-primary .v-icon,
.text-primary .v-list-item-subtitle {
  color: rgb(var(--v-theme-primary));
}

.info-icon {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity)) !important;
}
</style>
