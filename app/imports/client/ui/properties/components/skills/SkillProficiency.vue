<template>
  <v-list-item
    class="proficiency-viewer d-flex flex-1-1 align-center"
    v-on="!hideBreadcrumbs ? {click} : {}"
  >
    <div class="effect-icon">
      <v-tooltip location="bottom">
        <template #activator="{ props: activatorProps }">
          <v-icon
            class="mx-2"
            style="cursor: default;"
            size="large"
            v-bind="activatorProps"
          >
            {{ icon }}
          </v-icon>
        </template>
        <span>{{ proficiencyText }}</span>
      </v-tooltip>
    </div>
    <div
      class="text-h4 effect-value mr-2"
    >
      {{ proficiencyValue }}
    </div>
    <div class="d-flex flex-1-1 flex-column my-2">
      <div class="text-body-1 mb-1">
        {{ model.name || proficiencyText }}
      </div>
      <div v-if="!hideBreadcrumbs">
        <property-breadcrumbs
          :model="model"
          class="text-caption"
          no-links
          no-icons
          style="margin-bottom: 0"
        />
      </div>
    </div>
  </v-list-item>
</template>

<script setup>
import { computed } from 'vue';
import PropertyBreadcrumbs from '/imports/client/ui/creature/creatureProperties/PropertyBreadcrumbs.vue';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import getProficiencyIcon from '/imports/client/ui/utility/getProficiencyIcon';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  hideBreadcrumbs: Boolean,
  proficiencyBonus: {
    type: Number,
    default: 0,
  },
});

const emit = defineEmits(['click']);

const proficiency = computed(() => {
  switch (props.model?.type) {
    case 'proficiency': return props.model.value;
    case 'skill': return props.model.proficiency;
    default: return 0;
  }
});

const icon = computed(() => {
  return getProficiencyIcon(proficiency.value);
});

const proficiencyText = computed(() => {
  switch (proficiency.value) {
    case 0.49: return 'Half proficiency bonus rounded down';
    case 0.5: return 'Half proficiency bonus rounded up';
    case 1: return 'Proficient';
    case 2: return 'Double proficiency bonus';
    default: return '';
  }
});

const proficiencyValue = computed(() => {
  if (!props.proficiencyBonus) return numberToSignedString(0);
  if (proficiency.value === 0.49) {
    return numberToSignedString(Math.floor(0.5 * props.proficiencyBonus));
  } else {
    return numberToSignedString(Math.ceil(proficiency.value * props.proficiencyBonus));
  }
});

function click(e) {
  emit('click', e);
}
</script>

<style lang="css" scoped>
  .icon, .effect-icon {
    min-width: 30px;
  }
  .icon {
    color: inherit !important;
  }
  .net-effect {
    flex-grow: 0;
    flex-shrink: 0;
  }
  .effect-value {
    min-width: 60px;
    text-align: center;
  }
</style>
