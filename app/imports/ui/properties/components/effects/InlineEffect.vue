<template>
  <v-list-item
    class="effect-viewer d-flex flex-1-1 align-center"
    density="compact"
    @click="click"
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
        {{ formatQuantity(displayedValue, unit) }}
      </span>
      {{ displayedText }}
    </v-list-item-title>
  </v-list-item>
</template>

<script setup lang="js">
import { computed} from 'vue';
import { autorun } from 'vue-meteor-tracker';
import getEffectIcon from '/imports/ui/utility/getEffectIcon';
import { effectDisplayedValue, effectOperationName } from '/imports/ui/utility/effectDisplay';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { useI18n } from 'vue-i18n';
import useUnits, { useEffectUnit } from '/imports/ui/composables/useUnits';

const { t } = useI18n();

const props = defineProps({
  effectId: {
    type: String,
    required: true,
  },
});

const emit = defineEmits(['click']);

const model = autorun(() => CreatureProperties.findOne(props.effectId)).result;

// An amount in metres or kilograms is shown in the user's units
const { formatQuantity } = useUnits();
const unit = useEffectUnit(() => model.value);


const resolvedValue = computed(() => {
  let amount = model.value?.amount;
  if (!amount) return;
  return amount.value !== undefined ? amount.value : amount.calculation;
});

const effectIcon = computed(() => {
  let value = resolvedValue.value;
  return getEffectIcon(model.value?.operation, value);
});

const operation = computed(() => effectOperationName(model.value?.operation, t));

const displayedText = computed(() => {
  if (model.value?.operation === 'conditional') {
    return model.value.text || model.value.name || operation.value;
  } else {
    return model.value?.name || operation.value;
  }
});


const displayedValue = computed(() => effectDisplayedValue(model.value?.operation, resolvedValue.value));

function click(e) {
  emit('click', e);
}
</script>

<style lang="css" scoped>
  .effect-icon {
    min-width: 20px;
  }
  .effect-value {
    min-width: 30px;
    text-align: center;
  }
</style>
