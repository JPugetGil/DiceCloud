<template>
  <div class="effect-viewer">
    <v-row density="compact">
      <property-field :name="$t('forms.operation')">
        <div
          class="d-flex flex-1-1"
          style="overflow: hidden;"
        >
          <v-icon class="mr-2">
            {{ effectIcon }}
          </v-icon>
          {{ operation }}
        </div>
      </property-field>
      <property-field
        v-if="model.operation !== 'conditional'"
        :name="$t('viewers.amount')"
        :value="formatQuantity(displayedValue, unit) || ' '"
      />
      <property-target-tags
        v-if="model.targetByTags"
        :model="model"
      />
      <property-field
        v-else
        :name="$t('viewers.stats')"
      >
        <div class="d-flex flex-wrap">
          <v-chip
            v-for="(stat, index) in model.stats"
            :key="index"
            class="ma-1"
          >
            {{ stat }}
          </v-chip>
        </div>
      </property-field>
      <property-field
        v-if="model.operation === 'conditional'"
        :name="$t('forms.text')"
        :cols="{cols: 12}"
        :value="model.text || ' '"
      />
    </v-row>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import PropertyTargetTags from '/imports/ui/properties/viewers/shared/PropertyTargetTags.vue';
import getEffectIcon from '/imports/ui/utility/getEffectIcon';
import { effectDisplayedValue, effectOperationName } from '/imports/ui/utility/effectDisplay';
import PropertyField from '/imports/ui/properties/viewers/shared/PropertyField.vue';
import { useI18n } from 'vue-i18n';
import useUnits, { useEffectUnit } from '/imports/ui/composables/useUnits';

const { t } = useI18n();

const { formatQuantity } = useUnits();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

// An amount in metres or kilograms is shown in the user's units
const unit = useEffectUnit(() => props.model);

const resolvedValue = computed(() => {
  if (!props.model.amount) return;
  return props.model.amount.value !== undefined ?
    props.model.amount.value :
    props.model.amount.calculation;
});

const effectIcon = computed(() => {
  let value = resolvedValue.value;
  return getEffectIcon(props.model.operation, value);
});

const operation = computed(() => effectOperationName(props.model.operation, t));

const displayedValue = computed(() => effectDisplayedValue(props.model.operation, resolvedValue.value));
</script>

<style lang="css" scoped>

.value,
.calculation {
  min-width: 80px;
}
</style>
