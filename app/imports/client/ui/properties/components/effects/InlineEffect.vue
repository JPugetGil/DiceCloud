<template>
  <v-list-item
    class="effect-viewer d-flex flex-1-1 align-center"
    density="compact"
    v-on="!hideBreadcrumbs ? {click} : {}"
  >
    <div class="effect-icon">
      <v-tooltip location="bottom">
        <template #activator="{ props: activatorProps }">
          <v-icon
            class="mx-2"
            style="cursor: default;"
            v-bind="activatorProps"
          >
            {{ effectIcon }}
          </v-icon>
        </template>
        <span>{{ operation }}</span>
      </v-tooltip>
    </div>

    <v-list-item-title>
      <span
        class="effect-value mr-2"
      >
        {{ displayedValue }}
      </span>
      {{ displayedText }}
    </v-list-item-title>
  </v-list-item>
</template>

<script setup lang="js">
import { computed} from 'vue';
import { autorun } from 'vue-meteor-tracker';
import getEffectIcon from '/imports/client/ui/utility/getEffectIcon';
import { isFinite } from 'lodash';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  hideBreadcrumbs: Boolean,
  effectId: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['click']);

const model = autorun(() => CreatureProperties.findOne(props.effectId)).result;


const resolvedValue = computed(() => {
  let amount = model.value?.amount;
  if (!amount) return;
  return amount.value !== undefined ? amount.value : amount.calculation;
});

const effectIcon = computed(() => {
  let value = resolvedValue.value;
  return getEffectIcon(model.value?.operation, value);
});

const operation = computed(() => {
  switch(model.value?.operation) {
    case 'base': return t('effectOps.base');
    case 'add': return t('effectOps.add');
    case 'mul': return t('effectOps.mul');
    case 'min': return t('effectOps.min');
    case 'max': return t('effectOps.max');
    case 'advantage': return t('effectOps.advantage');
    case 'disadvantage': return t('effectOps.disadvantage');
    case 'passiveAdd': return t('effectOps.passiveAdd');
    case 'fail': return t('effectOps.fail');
    case 'conditional': return t('effectOps.conditional');
    default: return '';
  }
});

const displayedText = computed(() => {
  if (model.value?.operation === 'conditional') {
    return model.value.text || model.value.name || operation.value;
  } else {
    return model.value?.name || operation.value;
  }
});


const displayedValue = computed(() => {
  let value = resolvedValue.value;
  switch(model.value?.operation) {
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

function click(e) {
  emit('click', e);
}
</script>

<style lang="css" scoped>
  .icon, .effect-icon {
    min-width: 20px;
  }
  .icon {
    color: inherit !important;
  }
  .net-effect {
    flex-grow: 0;
    flex-shrink: 0;
  }
  .effect-value {
    min-width: 30px;
    text-align: center;
  }
</style>
