<template>
  <div class="point-buy-form">
    <point-buy-spend-form
      v-if="!context.isLibraryForm"
      :model="model"
      @change="e => $emit('change', e)"
    />
    <form-sections type="pointBuy">
      <form-section name="Point buy settings">
        <v-row dense>
          <v-col
            cols="12"
            md="6"
          >
            <computed-field
              label="Min"
              hint="The minimum value for each row"
              placeholder="0"
              :model="model.min"
              :error-messages="errors.min"
              @change="({path, value, ack}) =>
                $emit('change', {path: ['min', ...path], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <computed-field
              label="Max"
              hint="The maximum value for each row"
              placeholder="100"
              :model="model.max"
              :error-messages="errors.max"
              @change="({path, value, ack}) =>
                $emit('change', {path: ['max', ...path], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <computed-field
              label="Cost function"
              hint="A function of `value` that determines the cost of each row"
              hide-value
              :model="model.cost"
              :error-messages="errors.cost"
              @change="({path, value, ack}) =>
                $emit('change', {path: ['cost', ...path], value, ack})"
            />
          </v-col>
          <v-col
            cols="12"
            md="6"
          >
            <computed-field
              label="Total available points"
              hint="The total allowed cost of all rows"
              :model="model.total"
              :error-messages="errors.total"
              @change="({path, value, ack}) =>
                $emit('change', {path: ['total', ...path], value, ack})"
            />
          </v-col>
        </v-row>
      </form-section>
      <form-section name="Rows">
        <v-slide-x-transition
          group
          leave-absolute
        >
          <v-row
            v-for="(row, i) in model.values"
            :key="row._id"
            dense
          >
            <v-divider
              v-if="i"
              style="flex-basis: 100%;"
              class="mb-6"
            />
            <v-col cols="11">
              <v-row dense>
                <v-col
                  cols="12"
                  md="6"
                >
                  <text-field
                    ref="focusFirst"
                    label="Row Name"
                    :value="row.name"
                    :error-messages="errors.values && errors.values[i] && errors.values[i].name"
                    @change="(value, ack) => change(['values', i, 'name'], value, ack)"
                  />
                </v-col>
                <v-col
                  cols="12"
                  md="6"
                >
                  <text-field
                    label="Variable name"
                    :value="row.variableName"
                    hint="Use this name in calculations to reference this row of the table"
                    :error-messages="errors.values && errors.values[i] && errors.values[i].variableName"
                    @change="(value, ack) => change(['values', i, 'variableName'], value, ack)"
                  />
                </v-col>
                <v-col
                  v-if="context.isLibraryForm"
                  cols="12"
                  md="6"
                >
                  <text-field
                    label="Default value"
                    :value="row.value"
                    hint="The starting value of the row"
                    :error-messages="errors.values && errors.values[i] && errors.values[i].value"
                    @change="(value, ack) => change(['values', i, 'value'], value, ack)"
                  />
                </v-col>
                <v-col
                  v-if="row.errors && row.errors.length"
                  cols="12"
                >
                  <calculation-error-list
                    :errors="row.errors"
                  />
                </v-col>
              </v-row>
            </v-col>
            <v-col
              cols="1"
              class="d-flex align-center justify-center"
            >
              <v-btn
                variant="text"
                icon
                size="large"
                @click="$emit('pull', {path: ['values', i]})"
              >
                <v-icon>mdi-delete</v-icon>
              </v-btn>
            </v-col>
          </v-row>
          <v-row
            key="addButton"
            dense
            justify="end"
            class="mb-4"
          >
            <v-col
              cols="1"
              class="d-flex justify-center"
            >
              <v-btn
                icon
                variant="outlined"
                :loading="addRowLoading"
                :disabled="rowsFull"
                @click="addRow"
              >
                <v-icon>
                  mdi-plus
                </v-icon>
              </v-btn>
            </v-col>
          </v-row>
        </v-slide-x-transition>
      </form-section>
      <slot />
    </form-sections>
  </div>
</template>

<script setup>
import { ref, computed, inject } from 'vue';
import { PointBuySchema } from '/imports/api/properties/PointBuys';
import CalculationErrorList from '/imports/client/ui/properties/forms/shared/CalculationErrorList.vue';
import PointBuySpendForm from '/imports/client/ui/properties/forms/PointBuySpendForm.vue';
import ComputedField from '/imports/client/ui/properties/forms/shared/ComputedField.vue';
import FormSection from '/imports/client/ui/properties/forms/shared/FormSection.vue';
import FormSections from '/imports/client/ui/properties/forms/shared/FormSections.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change', 'push', 'pull']);


const context = inject('context', {});

const addRowLoading = ref(false);

const rowsFull = computed(() => {
  if (!props.model.values) return false;
  let maxCount = PointBuySchema.get('values', 'maxCount');
  return props.model.values.length >= maxCount;
});

const change = (path, value, ack) => {
  emit('change', { path, value, ack });
};

const acknowledgeAddResult = () => {
  addRowLoading.value = false;
};

const addRow = () => {
  addRowLoading.value = true;
  emit('push', {
    path: ['values'],
    value: {
      _id: Random.id(),
    },
    ack: acknowledgeAddResult,
  });
};
</script>
