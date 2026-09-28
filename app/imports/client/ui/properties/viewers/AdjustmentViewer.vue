<template>
  <div class="adjustment-viewer">
    <v-row dense>
      <property-field
        :name="$t('viewers.amount')"
        center
        large
      >
        <v-icon class="mx-1">
          {{ effectIcon }}
        </v-icon>
        {{ displayedValue }}
      </property-field>
      <property-field
        :name="$t('forms.attributeLabel')"
        mono
        :value="model.stat"
      />
      <property-field
        v-if="model.target === 'self'"
        :name="$t('viewers.target')"
        :value="$t('targets.self')"
      />
    </v-row>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import getEffectIcon from '/imports/client/ui/utility/getEffectIcon';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const effectIcon = computed(() => {
  let effectOp = props.model.operation === 'increment' ? 'add' : 'base';
  // Not `let value`: it shadowed the `value` computed below and read itself
  let amount = value.value;
  if (typeof amount === 'string') {
    amount = 1;
  }
  return getEffectIcon(effectOp, -amount);
});

const value = computed(() => {
  if (props.model.amount && 'value' in props.model.amount) {
    return props.model.amount.value;
  } else {
    return props.model.amount.calculation;
  }
});

const displayedValue = computed(() => {
  if (
    typeof value.value === 'number' &&
    props.model.operation !== 'set'
  ) {
    return Math.abs(value.value);
  } else {
    return value.value;
  }
});

</script>

<style lang="css" scoped>

</style>
