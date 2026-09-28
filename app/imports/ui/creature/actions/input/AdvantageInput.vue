<template>
  <div class="d-flex flex-column justify-center align-center">
    <v-btn-toggle
      v-model="model"
      color="accent"
    >
      <v-btn :value="-1">
        {{ $t('common.disadvantage') }}
      </v-btn>
      <v-btn :value="1">
        {{ $t('common.advantage') }}
      </v-btn>
    </v-btn-toggle>
    <div style="position: relative;">
      <v-scale-transition
        origin="center center"
      >
        <vertical-hex
          v-if="model"
          id="extra-hex"
          style="position:absolute; transition: margin-left 0.3s ease;"
          :style="{marginLeft: model == 1 ? '24px' : '-24px'}"
          disable-hover
        />
      </v-scale-transition>
      <vertical-hex
        id="roll-hex"
        @click="emit('continue')"
      >
        <div>
          {{ $t('common.roll') }}
        </div>
      </vertical-hex>
    </div>
  </div>
</template>

<script setup>
import VerticalHex from '/imports/ui/components/VerticalHex.vue';

// Deselecting both buttons means a straight roll: 0, not undefined
const model = defineModel({
  type: Number,
  required: true,
  set: value => value || 0,
});

const emit = defineEmits(['continue']);
</script>
