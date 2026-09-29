<template>
  <v-col
    v-if="value !== undefined ||
      calculation !== undefined ||
      $slots.default"
    v-bind="cols"
    class="mb-3"
  >
    <outlined-input
      :name="name"
      class="h-100"
      hide-details
      no-hover
      content-class="px-3 pt-3 pb-2 d-flex flex-column align-start h-100"
      @click="$emit('click', $event)"
    >
      <div
        class="flex-grow-1 d-flex align-center flex-wrap"
        style="width: 100%;"
      >
        <div
          class="d-flex align-center"
          :class="{
            'text-body-large': !isLarge,
            'text-headline-large': isLarge,
            'justify-center': isCenter,
            'justify-end': end,
            'flex-wrap': wrap,
            'text-mono': isMono,
            'flex-grow-0': hasEffectsOrProficiencies,
            'flex-grow-1': !hasEffectsOrProficiencies, 
            'ma-3': hasEffectsOrProficiencies,
            ...$attrs.class,
          }"
          style="overflow-x: auto;"
          v-bind="$attrs"
        >
          <slot>
            <template v-if="value !== undefined">
              {{ valueText }}
            </template>
            <template v-else-if="calculation !== undefined">
              {{ calculationText }}
            </template>
          </slot>
        </div>
        <div
          v-if="hasEffectsOrProficiencies"
          class="flex-grow-1"
          style="max-width: 100%;"
        >
          <inline-effect
            v-for="effectId in calculation.effectIds"
            :key="effectId"
            :data-id="effectId"
            :effect-id="effectId"
            @click="clickEffect(effectId)"
          />
          <inline-proficiency
            v-for="proficiencyId in calculation.proficiencyIds"
            :key="proficiencyId"
            :data-id="proficiencyId"
            :proficiency-id="proficiencyId"
            @click="clickEffect(proficiencyId)"
          />
        </div>
        <div
          v-if="hasEffectsOrProficiencies"
          class="d-flex justify-end border-t-sm pt-2"
          style="width: 100%; opacity: 0.5"
        >
          {{ calculation.value }}
        </div>
      </div>
    </outlined-input>
  </v-col>
</template>

<script setup>
import { computed } from 'vue';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import InlineEffect from '/imports/ui/properties/components/effects/InlineEffect.vue';
import InlineProficiency from '/imports/ui/properties/components/proficiencies/InlineProficiency.vue';
import OutlinedInput from '/imports/ui/properties/viewers/shared/OutlinedInput.vue';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

const props = defineProps({
  name: {
    type: String,
    default: undefined,
  },
  value: {
    type: [String, Number, Boolean],
    default: undefined,
  },
  calculation: {
    type: Object,
    default: undefined,
  },
  center: Boolean,
  end: Boolean,
  large: Boolean,
  mono: Boolean,
  signed: Boolean,
  wrap: Boolean,
  cols: {
    type: Object,
    default: () => ({cols: 12, sm: 6, md: 4}),
  },
});

defineEmits(['click']);

const dialogStackStore = useDialogStackStore();

const showCalculationInsteadOfValue = computed(() => {
  if (!props.calculation) return;
  return props.calculation && props.calculation.value === undefined;
});

const valueNotReduced = computed(() => {
  if (!props.calculation) return;
  return typeof props.calculation.value === 'string'
});

const valueText = computed(() => {
  if (props.signed) {
    return numberToSignedString(props.value);
  } else {
    return props.value;
  }
});

const calculationText = computed(() => {
  const calculation = props.calculation;
  if (!calculation) {
    return undefined;
  }
  if (calculation.value === undefined){
    return calculation.calculation;
  }
  if (props.signed) {
    return numberToSignedString(calculation.value);
  }
  if (hasEffectsOrProficiencies.value) {
    return calculation.unaffected;
  }
  return calculation.value;
});

const isLarge = computed(() => {
  if (showCalculationInsteadOfValue.value) return false;
  if (valueNotReduced.value) return false;
  return props.large;
});

const isCenter = computed(() => {
  if (showCalculationInsteadOfValue.value) return false;
  if (valueNotReduced.value) return false;
  return props.center;
});

const isMono = computed(() => {
  if (showCalculationInsteadOfValue.value) return true;
  if (valueNotReduced.value) return true;
  return props.mono;
});

const hasEffects = computed(() => {
  return props.calculation?.effectIds?.length > 0;
});

const hasProficiencies = computed(() => {
  return props.calculation?.proficiencyIds?.length > 0;
});

const hasEffectsOrProficiencies = computed(() => {
  return hasEffects.value || hasProficiencies.value;
});

function clickEffect(id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${id}`,
    data: {_id: id},
  });
}
</script>

