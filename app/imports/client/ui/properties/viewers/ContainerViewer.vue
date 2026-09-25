<template>
  <div class="container-viewer">
    <v-row dense>
      <property-field
        :name="$t('viewers.value')"
        :cols="{cols: 12, md: 6}"
      >
        <div style="overflow: hidden;">
          <div
            v-if="model.value !== undefined"
            class="d-flex flex-1-1 align-center mb-2"
          >
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
          </div>
          <div class="d-flex flex-1-1 align-center">
            <v-icon
              class="mr-2"
              size="large"
            >
              $cash
            </v-icon>
            <coin-value
              class="text-subtitle-1 mr-2"
              :value="model.contentsValue"
            />
            <span class="text-subtitle-1">
              {{ $t('common.contents') }}
            </span>
          </div>
        </div>
      </property-field>
      <property-field
        :name="$t('forms.weight')"
        :cols="{cols: 12, md: 6}"
      >
        <div style="overflow: hidden;">
          <div
            v-if="model.weight !== undefined"
            class="d-flex flex-1-1 align-center mb-2"
          >
            <v-icon
              class="mr-2"
              size="large"
            >
              $weight
            </v-icon>
            <span class="text-subtitle-1 mr-2">
              {{ $t('common.weightLb', { weight: model.weight }) }}
            </span>
          </div>
          <div
            class="d-flex flex-1-1 align-center"
            :class="{'mb-2': model.contentsWeightless}"
          >
            <v-icon
              class="mr-2"
              size="large"
            >
              $injustice
            </v-icon>
            <span class="text-subtitle-1 mr-2">
              {{ $t('common.weightLb', { weight: model.contentsWeight }) }}
            </span>
            <span class="text-subtitle-1">
              {{ $t('common.contents') }}
            </span>
          </div>
        </div>
      </property-field>
      <property-field
        v-if="model.carried"
        :value="$t('forms.carried')"
      />
      <property-field v-if="model.contentsWeightless">
        <v-icon
          style="overflow: hidden;"
          class="ma-1"
        >
          $weightless
        </v-icon>
        <span class="ml-1">{{ $t('viewers.contentsWeightless') }}</span>
      </property-field>
      <property-description
        :name="$t('common.description')"
        :model="model.description"
      />
    </v-row>
  </div>
</template>

<script setup>
import CoinValue from '/imports/client/ui/components/CoinValue.vue';
import PropertyField from '/imports/client/ui/properties/viewers/shared/PropertyField.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';

defineProps({
  model: {
    type: Object,
    required: true,
  },
});
</script>

<style lang="css" scoped>

</style>
