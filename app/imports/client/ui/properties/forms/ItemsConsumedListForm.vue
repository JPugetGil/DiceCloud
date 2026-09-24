<template>
  <div class="mt-4">
    <v-slide-x-transition group>
      <div
        v-for="(item, i) in model"
        :key="item._id || i"
      >
        <div class="d-flex flex-1-1 align-center">
          <div style="flex-grow: 1;">
            <item-consumed-form
              :model="item"
              @change="({path, value, ack}) => change([i, ...path], value, ack)"
            />
          </div>
          <v-btn
            variant="outlined"
            icon
            size="large"
            class="ma-3"
            style="margin-bottom: 30px !important;"
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
import ItemConsumedForm from '/imports/client/ui/properties/forms/ItemConsumedForm.vue';

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

const emit = defineEmits(['change', 'pull']);

function change(path, value, ack) {
  if (!Array.isArray(path)) {
    path = [path];
  }
  emit('change', { path, value, ack });
}
</script>
