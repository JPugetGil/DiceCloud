<template>
  <v-menu
    v-model="open"
    origin="center center"
    transition="scale-transition"
    :offset="[0, -130]"
    :min-width="305"
    :close-on-content-click="false"
  >
    <template #activator="{ props }">
      <v-btn
        v-bind="{ ...$attrs, ...props }"
        :loading="loading"
        @click.stop
      >
        <slot>
          <v-icon>$abacus</v-icon>
        </slot>
      </v-btn>
    </template>
    <v-card>
      <increment-menu
        flat
        :value="value"
        :open="open"
        @change="changeIncrementMenu"
        @close="open = false"
      />
    </v-card>
  </v-menu>
</template>

<script setup lang="js">
import { ref } from 'vue';
import IncrementMenu from '/imports/client/ui/components/IncrementMenu.vue';

defineProps({
  value: {
    type: Number,
    required: true,
  },
  loading: Boolean,
});

const emit = defineEmits(['change']);

const open = ref(false);

function changeIncrementMenu(e) {
  emit('change', e);
  open.value = false;
}
</script>

<style lang="css" scoped>
</style>
