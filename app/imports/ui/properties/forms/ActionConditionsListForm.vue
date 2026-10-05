<template>
  <div class="mt-4">
    <v-slide-x-transition group>
      <div
        v-for="(condition, i) in model"
        :key="condition._id || i"
      >
        <div class="d-flex flex-1-1 align-center">
          <div style="flex-grow: 1;">
            <action-condition-form
              :model="condition"
              @change="({path, value, ack}) => change([i, ...path], value, ack)"
            />
          </div>
          <v-btn
            variant="outlined"
            icon
            size="large"
            class="ma-3 mb-8"
            @click="$emit('pull', {path: [i]})"
          >
            <v-icon>mdi-delete</v-icon>
          </v-btn>
        </div>
      </div>
    </v-slide-x-transition>
  </div>
</template>

<script setup>
import ActionConditionForm from '/imports/ui/properties/forms/ActionConditionForm.vue';

defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
});

const emit = defineEmits(['change', 'pull']);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>
