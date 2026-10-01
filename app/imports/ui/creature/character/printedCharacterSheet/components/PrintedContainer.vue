<template>
  <div class="inventory-container">
    <div class="d-flex justify-center">
      <property-icon
        class="ml-2"
        color="rgba(0,0,0,0.7)"
        :model="model"
      />
      <div class="label">
        {{ model.name }}
      </div>
    </div>

    <div
      v-if="model.value !== undefined || model.weight !== undefined"
      class="weight-value my-2 d-flex justify-space-between"
    >
      <div class="value ml-4">
        <div
          v-if="model.value !== undefined"
        >
          <div class="d-flex flex-1-1 align-center">
            <v-icon
              class="mr-2"
              size="small"
            >
              $two_coins
            </v-icon>
            <coin-value
              class="mr-2"
              :value="model.value"
            />
          </div>

          <div class="d-flex flex-1-1 align-center mb-2">
            <v-icon
              class="mr-2"
              size="small"
            >
              $cash
            </v-icon>
            <coin-value
              :value="model.contentsValue"
            />
            <span
              class="ml-1"
            >
              {{ $t('common.contents') }}
            </span>
          </div>
        </div>
      </div>

      <div class="weight ml-4">
        <div
          v-if="model.weight !== undefined"
        >
          <div class="d-flex flex-1-1 align-center">
            <v-icon
              class="mr-2"
              size="small"
            >
              $weight
            </v-icon>
            {{ formatQuantity(model.weight, 'weight') }}
          </div>

          <div class="d-flex flex-1-1 align-center mb-2">
            <v-icon
              class="mr-2"
              size="small"
            >
              $injustice
            </v-icon>
            {{ formatQuantity(model.contentsWeight, 'weight') }}
            <span
              class="ml-1"
            >
              {{ $t('common.contents') }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import CoinValue from '/imports/ui/components/CoinValue.vue';
import PropertyIcon from '/imports/ui/properties/shared/PropertyIcon.vue';
import useUnits from '/imports/ui/composables/useUnits';

// Weights are stored in kilograms, shown in the user's unit
const { formatQuantity } = useUnits();

defineProps({
  model: {
    type: Object,
    default: () => ({}),
  },
  selected: Boolean,
  hideIcon: Boolean,
  preparingSpells: Boolean,
});




</script>
