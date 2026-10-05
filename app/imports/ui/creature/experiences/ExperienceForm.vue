<template>
  <div class="experience-form">
    <div class="d-flex flex-1-1 flex-column align-center">
      <smart-switch
        :label="$t('xp.milestone')"
        class="mx-3"
        :model-value="milestone"
        @change="makeMilestone"
      />
      <text-field
        v-if="milestone"
        :label="$t('xp.levels')"
        type="number"
        class="base-value-field text-center large-format no-flex"
        :model-value="model.levels"
        :error-messages="errors.levels"
        @change="(value, ack) => change('levels', value, ack)"
      />
      <text-field
        v-else
        type="number"
        class="base-value-field text-center large-format no-flex"
        :suffix="$t('xp.xp')"
        autofocus
        :model-value="model.xp"
        :error-messages="errors.xp"
        @change="(value, ack) => change('xp', value, ack)"
      />
    </div>
    <text-field
      :label="$t('common.name')"
      :autofocus="milestone"
      :model-value="model.name"
      :error-messages="errors.name"
      @change="(value, ack) => change('name', value, ack)"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue';

defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(['change']);

const milestone = ref(false);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}

function makeMilestone(isMilestone, ack) {
  milestone.value = isMilestone;
  if (isMilestone) {
    change('xp', undefined);
    change('levels', 1, ack);
  } else {
    change('levels', undefined, ack);
  }
}
</script>

<style lang="css" scoped>
</style>
