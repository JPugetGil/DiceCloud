<template>
  <div class="item-viewer">
    <v-row dense>
      <property-field
        v-if="model.quantity > 1 || model.showIncrement"
        name="Quantity"
        large
      >
        <v-spacer />
        <div>{{ model.quantity }}</div>
        <v-spacer />
        <increment-button
          v-if="context.creatureId && model.showIncrement"
          icon
          large
          outlined
          color="primary"
          :loading="incrementLoading"
          :value="model.quantity"
          @change="changeQuantity"
        />
      </property-field>
      <property-field
        v-if="context.creatureId"
        name="Delete"
        center
      >
        <v-btn
          variant="outlined"
          style="font-size: 18px;"
          class="ma-2"
          :color="'primary'"
          icon
          :disabled="!context.editPermission"
          @click="$emit('remove')"
        >
          <v-icon>mdi-delete</v-icon>
        </v-btn>
      </property-field>
      <property-field
        v-if="model.value !== undefined"
        name="value"
      >
        <div style="overflow: hidden;">
          <div
            v-if="model.quantity > 1"
            class="d-flex flex-1-1 align-center mb-2"
          >
            <v-icon
              class="mr-2"
              size="large"
            >
              $cash
            </v-icon>
            <coin-value
              class="text-subtitle-1"
              :value="totalValue"
            />
          </div>
          <div class="d-flex flex-1-1 align-center">
            <v-icon
              class="mr-2"
              size="large"
            >
              $two_coins
            </v-icon>
            <coin-value
              class="text-subtitle-1 mr-2"
              :value="model.value"
            />
            <span
              v-if="model.quantity > 1"
              class="text-subtitle-1"
            >
              each
            </span>
          </div>
        </div>
      </property-field>
      <property-field
        v-if="model.weight !== undefined"
        name="Weight"
      >
        <div style="overflow: hidden;">
          <div
            v-if="model.quantity > 1"
            class="d-flex flex-1-1 align-center mb-2"
          >
            <v-icon
              class="mr-2"
              size="large"
            >
              $injustice
            </v-icon>
            <span class="text-subtitle-1">
              {{ totalWeight }} lb
            </span>
          </div>
          <div class="d-flex flex-1-1 align-center">
            <v-icon
              class="mr-2"
              size="large"
            >
              $weight
            </v-icon>
            <span class="text-subtitle-1 mr-2">
              {{ model.weight }} lb
            </span>
            <span
              v-if="model.quantity > 1"
              class="text-subtitle-1"
            >
              each
            </span>
          </div>
        </div>
      </property-field>
      <property-field v-if="model.equipped">
        <v-icon
          style="overflow: hidden;"
          class="ma-1"
        >
          mdi-account-arrow-left
        </v-icon>
        <span class="ml-1">Equipped</span>
      </property-field>
      <property-field
        v-if="model.requiresAttunement && context.creatureId"
        name="Requires attunement"
      >
        <smart-switch
          class="ml-4"
          label="Attuned"
          :value="model.attuned"
          @change="(value, ack) => $emit('change', { path: ['attuned'], value, ack })"
        />
      </property-field>
      <property-field v-if="model.requiresAttunement && !context.creatureId">
        <template v-if="model.attuned">
          <v-icon
            style="overflow: hidden;"
            class="ma-1"
          >
            $spell
          </v-icon>
          <span class="ml-1">Attuned</span>
        </template>
        <template v-else>
          Requires attunement
        </template>
      </property-field>
      <property-description
        name="Description"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import { inject, ref, computed } from 'vue';
import CoinValue from '/imports/client/ui/components/CoinValue.vue';
import IncrementButton from '/imports/client/ui/components/IncrementButton.vue';
import adjustQuantity from '/imports/api/creature/creatureProperties/methods/adjustQuantity';
import stripFloatingPointOddities from '/imports/api/engine/computation/utility/stripFloatingPointOddities';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

defineEmits(['remove', 'change']);

const context = inject('context', {});

const incrementLoading = ref(false);

const totalValue = computed(() => {
  return stripFloatingPointOddities(props.model.value * props.model.quantity);
});

const totalWeight = computed(() => {
  return stripFloatingPointOddities(props.model.weight * props.model.quantity);
});



async function changeQuantity({ type, value }) {
  incrementLoading.value = true;
  try {
    await adjustQuantity.callAsync({
      _id: props.model._id,
      operation: type,
      value: value
    });
  } catch (error) {
    snackbar({ text: error.reason });
    console.error(error);
  } finally {
    incrementLoading.value = false;
  }
}
</script>

<style lang="css" scoped>

</style>
