<template>
  <v-list-item
    class="hit-dice-list-tile"
    :class="{ hover }"
  >
    <template #prepend>
      <div class="mr-4">
        <div class="d-flex flex-1-1 align-center float-left">
          <div class="d-flex flex-1-1 flex-column justify-center buttons">
            <v-btn
              variant="text"
              icon
              size="small"
              :disabled="model.value >= model.total || context.editPermission === false"
              @click="increment(1)"
            >
              <v-icon>mdi-chevron-up</v-icon>
            </v-btn>
            <v-btn
              variant="text"
              icon
              size="small"
              :disabled="model.value <= 0 || context.editPermission === false"
              @click="increment(-1)"
            >
              <v-icon>mdi-chevron-down</v-icon>
            </v-btn>
          </div>

          <div class="d-flex flex-1-1 align-end">
            <div class="text-h4">
              {{ model.value }}
            </div>
            <div class="text-h6 max-value ml-2">
              /{{ model.total }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <div
      class="content"
      @click="click"
      @mouseover="hover = true"
      @mouseleave="hover = false"
    >
      <v-list-item-title>
        {{ model.hitDiceSize }} {{ signedConMod }}
      </v-list-item-title>
    </div>
  </v-list-item>
</template>

<script setup lang="js">
import { ref, computed, inject } from 'vue';
import numberToSignedString from '/imports/api/utility/numberToSignedString';

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(['click', 'change']);

const context = inject('context', {});

const hover = ref(false);

const signedConMod = computed(() => {
  return numberToSignedString(props.model.constitutionMod);
});

function click(e) {
  emit('click', e);
}

function increment(value) {
  emit('change', { type: 'increment', value });
}
</script>

<style lang="css" scoped>
.hit-dice-list-tile {
  background: inherit;
  min-height: 88px;
}

.left {
  height: 100%;
}

.buttons {
  height: 100%;
}

.buttons>.v-btn {
  margin: 0;
}

.hit-dice-list-tile.hover {
  background: rgba(var(--v-theme-on-surface), var(--v-hover-opacity)) !important;
}

.content {
  cursor: pointer;
}

.max-value {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
