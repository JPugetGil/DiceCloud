<template>
  <v-list-item
    class="skill-list-tile"
    min-height="44"
    v-on="hasClickListener ? {click} : {}"
  >
    <v-list-item-title class="d-flex align-center ga-2">
      <proficiency-icon
        :value="model.proficiency"
        class="flex-shrink-0"
      />
      <check-button
        v-if="!hideModifier"
        :model="model"
        class="flex-shrink-0"
      >
        <value-change
          :value="model.value"
          :change-key="`${model._id}.value`"
        >
          {{ displayedModifier }}
        </value-change>
        <v-icon
          v-if="model.advantage > 0"
          end
          size="small"
          :aria-label="$t('common.advantage')"
        >
          mdi-chevron-double-up
        </v-icon>
        <v-icon
          v-if="model.advantage < 0"
          end
          size="small"
          :aria-label="$t('common.disadvantage')"
        >
          mdi-chevron-double-down
        </v-icon>
      </check-button>
      <div class="text-truncate">
        {{ model.name }}
        <template v-if="model.conditionalBenefits && model.conditionalBenefits.length">
          *
        </template>
        <span
          v-if="'passiveBonus' in model"
          class="text-medium-emphasis"
        >
          ({{ passiveScore }})
        </span>
      </div>
    </v-list-item-title>
  </v-list-item>
</template>

<script setup lang="js">
import { computed } from 'vue';
import ProficiencyIcon from '/imports/ui/properties/shared/ProficiencyIcon.vue';
import CheckButton from '/imports/ui/properties/shared/CheckButton.vue';
import ValueChange from '/imports/ui/components/ValueChange.vue';
import numberToSignedString from '/imports/api/utility/numberToSignedString';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  hideModifier: Boolean,
  // The parent's @click listener, declared so that the tile knows whether it is
  // clickable: Vue keeps a declared event's listener out of $attrs.
  // `emit('click')` still calls it.
  onClick: {
    type: Function,
    default: undefined,
  },
});

const emit = defineEmits(['click']);

const displayedModifier = computed(() => {
  let mod = props.model.value;
  if (props.model.fail) {
    return 'fail';
  } else {
    return numberToSignedString(mod);
  }
});

const hasClickListener = computed(() => !!props.onClick);

const passiveScore = computed(() => {
  return 10 + props.model.value + props.model.passiveBonus;
});

function click(e) {
  emit('click', e);
}
</script>
