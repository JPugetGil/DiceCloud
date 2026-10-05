<template>
  <v-list-item
    class="effect-viewer"
    v-on="!hideBreadcrumbs ? {click} : {}"
  >
    <!-- One row: Vuetify puts the default slot in a block content area -->
    <div class="d-flex align-center">
      <div class="effect-icon">
        <v-tooltip location="bottom">
          <template #activator="{ props: activatorProps }">
            <v-icon
              class="mx-2"
              style="cursor: default;"
              size="large"
              v-bind="activatorProps"
            >
              {{ effectIcon }}
            </v-icon>
          </template>
          <span>{{ operation }}</span>
        </v-tooltip>
      </div>
      <div
        class="stat-value effect-value mr-2"
      >
        {{ displayed.value }}<span
          v-if="displayed.unit"
          class="text-title-small ml-1"
        >{{ displayed.unit }}</span>
      </div>
      <div class="d-flex flex-1-1 flex-column my-2">
        <div class="text-body-large mb-1">
          {{ displayedText }}
        </div>
        <div v-if="!hideBreadcrumbs && ancestors">
          <property-breadcrumbs
            :model="{...model, ancestors}"
            class="text-body-small"
            no-links
            no-icons
            style="margin-bottom: 0"
          />
        </div>
      </div>
    </div>
  </v-list-item>
</template>

<script setup>
import { computed} from 'vue';
import { autorun } from 'vue-meteor-tracker';
import getEffectIcon from '/imports/ui/utility/getEffectIcon';
import PropertyBreadcrumbs from '/imports/ui/creature/creatureProperties/PropertyBreadcrumbs.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { isFinite, find } from 'lodash';
import useUnits from '/imports/ui/composables/useUnits';
import numberToSignedString from '/imports/api/utility/numberToSignedString';
import { getAttributeUnit, CONVERTED_EFFECT_OPERATIONS } from '/imports/api/utility/units';

const props = defineProps({
  hideBreadcrumbs: Boolean,
  // The amount is a modifier, written with its sign: +2, −1
  signed: Boolean,
  model: {
    type: Object,
    required: true,
  },
  attribute: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['click']);


const operation = computed(() => {
  if (props.model.type === 'pointBuy' || props.model.type === 'attribute') {
    return 'base';
  }
  return props.model.operation;
});

const displayedText = computed(() => {
  if (operation.value === 'conditional') {
    return props.model.text || props.model.name || operation.value;
  } else {
    return props.model.name || operation.value;
  }
});

const resolvedValue = computed(() => {
  let amount = props.model.amount;
  if (!amount) return;
  return amount.value !== undefined ? amount.value : amount.calculation;
});

const effectIcon = computed(() => {
  let value = resolvedValue.value;
  return getEffectIcon(operation.value, value);
});



const displayedValue = computed(() => {
  let value = resolvedValue.value;
  if (props.model.type === 'pointBuy') {
    return find(props.model.values, row => props.attribute.variableName === row.variableName)?.value;
  } else if (props.model.type === 'attribute') {
    return props.model.baseValue?.value;
  }
  switch(operation.value) {
    case 'base': return value;
    case 'add': return isFinite(value) ? Math.abs(value) : value;
    case 'mul': return value;
    case 'min': return value;
    case 'max': return value;
    case 'advantage': return;
    case 'disadvantage': return;
    case 'passiveAdd': return isFinite(value) ? Math.abs(value) : value;
    case 'fail': return;
    case 'conditional': return undefined;
    default: return undefined;
  }
});

const { quantityParts } = useUnits();

// An amount in the attribute's unit (a distance, a weight) is shown in the
// user's units; a multiplier is not
const displayed = computed(() => {
  if (props.signed && isFinite(displayedValue.value)) {
    return { value: numberToSignedString(displayedValue.value), unit: undefined };
  }
  return quantityParts(
    displayedValue.value,
    CONVERTED_EFFECT_OPERATIONS.has(operation.value) ? getAttributeUnit(props.attribute) : undefined,
  );
});

const ancestors = autorun(() => {
  const prop = CreatureProperties.findOne(props.model._id);
  return prop && prop.ancestors || [];
}).result;

function click(e) {
  emit('click', e);
}
</script>

<style lang="css" scoped>
  .effect-icon {
    min-width: 30px;
  }
  .effect-value {
    min-width: 60px;
    text-align: center;
  }
</style>
