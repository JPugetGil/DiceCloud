<template>
  <div v-if="creature && errors && errors.length">
    <v-btn
      icon
      size="small"
      position="absolute"
      location="right"
      color="warning"
      class="mr-4"
      style="margin-top: -20px;"
      @click="expanded = !expanded"
    >
      <v-icon
        v-if="expanded"
        style="color: rgba(0,0,0,0.8);"
      >
        mdi-close
      </v-icon>
      <v-icon
        v-else
        style="color: rgba(0,0,0,0.8);"
      >
        mdi-alert-circle-outline
      </v-icon>
    </v-btn>
    <v-slide-y-transition>
      <div
        v-if="expanded"
        class="character-sheet-errors"
      >
        <template
          v-for="(error, index) in errors"
          :key="index"
        >
          <dependency-loop-error
            v-if="error.type === 'dependencyLoop'"
            :model="error"
          />
          <v-alert
            v-else-if="error.type === 'warning'"
            border="bottom"
            border-color="warning"
            elevation="2"
            type="warning"
          >
            {{ error.details.error }}
          </v-alert>
          <v-alert
            v-else
            :key="index + 'otherError'"
            border="bottom"
            border-color="error"
            elevation="2"
            type="error"
          >
            {{ error.type }}
          </v-alert>
        </template>
      </div>
    </v-slide-y-transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, inject } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import Creatures from '/imports/api/creature/creatures/Creatures';
import DependencyLoopError from '/imports/client/ui/creature/character/errors/DependencyLoopError.vue';
import updateCreature from '/imports/api/creature/creatures/methods/updateCreature';

const props = defineProps({
  creatureId: {
    type: String,
    default: undefined,
  }
});

const context = inject('context', {});

const expanded = ref(false);

const creature = autorun(() => {
  if (!props.creatureId) return;
  return Creatures.findOne(props.creatureId, {fields: {computeErrors: 1, settings: 1}});
}).result;

const errors = computed(() => {
  if (!creature.value || !creature.value.computeErrors) return [];
  return creature.value.computeErrors;
});

watch(expanded, async (value) => {
  if (context.editPermission === false) return;
  try {
    await updateCreature.callAsync({
      _id: props.creatureId,
      path: ['settings', 'hideCalculationErrors'],
      value: !value || null,
    });
  } catch (error) {
    console.error(error);
  }
});

onMounted(() => {
  if (creature.value?.settings) {
    expanded.value = !creature.value.settings.hideCalculationErrors;
  }
});
</script>

<style>
</style>
