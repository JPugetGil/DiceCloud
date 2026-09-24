<template>
  <v-list-item
    class="effect-viewer d-flex flex-1-1 align-center"
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
            {{ effectIcon }}
          </v-icon>
        </template>
        <span>{{ operation }}</span>
      </v-tooltip>
    </div>
    <div
      class="text-h4 effect-value mr-2"
    >
      {{ displayedValue }}
    </div>
    <div class="d-flex flex-1-1 flex-column my-2">
      <div class="text-body-1 mb-1">
        {{ displayedText }}
      </div>
      <div v-if="!hideBreadcrumbs && ancestors">
        <property-breadcrumbs
          :model="{...model, ancestors}"
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
import { computed} from 'vue';
import { autorun } from 'vue-meteor-tracker';
import getEffectIcon from '/imports/client/ui/utility/getEffectIcon';
import PropertyBreadcrumbs from '/imports/client/ui/creature/creatureProperties/PropertyBreadcrumbs.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { isFinite, find } from 'lodash';

const props = defineProps({
  hideBreadcrumbs: Boolean,
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

const ancestors = autorun(() => {
  const prop = CreatureProperties.findOne(props.model._id);
  return prop && prop.ancestors || [];
}).result;

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
