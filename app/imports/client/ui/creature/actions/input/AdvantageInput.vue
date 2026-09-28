<template>
  <div class="d-flex flex-column justify-center align-center">
    <v-btn-toggle
      :model-value="modelValue"
      color="accent"
      @update:model-value="emitInput"
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
          v-if="modelValue"
          id="extra-hex"
          style="position:absolute; transition: margin-left 0.3s ease;"
          :style="{marginLeft: modelValue == 1 ? '24px' : '-24px'}"
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
import VerticalHex from '/imports/client/ui/components/VerticalHex.vue';

defineProps({
  modelValue: {
    type: Number,
    required: true,
  }
});

const emit = defineEmits(['update:modelValue', 'continue']);

function emitInput(e) {
  e = e || 0;
  emit('update:modelValue', e);
}
</script>
