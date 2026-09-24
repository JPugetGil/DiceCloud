<template>
  <div class="resources-form">
    <div
      v-if="model.conditions && model.conditions.length"
      class="text-subtitle-1"
    >
      Conditions
    </div>
    <action-conditions-list-form
      :model="model.conditions"
      @change="({path, value, ack}) => $emit('change', {path: ['conditions', ...path], value, ack})"
      @push="({path, value, ack}) => $emit('push', {path: ['conditions', ...path], value, ack})"
      @pull="({path, ack}) => $emit('pull', {path: ['conditions', ...path], ack})"
    />
    <div
      v-if="model.attributesConsumed && model.attributesConsumed.length"
      class="text-subtitle-1"
    >
      Attributes
    </div>
    <attributes-consumed-list-form
      :model="model.attributesConsumed"
      @change="({path, value, ack}) => $emit('change', {path: ['attributesConsumed', ...path], value, ack})"
      @push="({path, value, ack}) => $emit('push', {path: ['attributesConsumed', ...path], value, ack})"
      @pull="({path, ack}) => $emit('pull', {path: ['attributesConsumed', ...path], ack})"
    />
    <div
      v-if="model.itemsConsumed && model.itemsConsumed.length"
      class="text-subtitle-1"
    >
      Ammo
    </div>
    <items-consumed-list-form
      :model="model.itemsConsumed"
      @change="({path, value, ack}) => $emit('change', {path: ['itemsConsumed', ...path], value, ack})"
      @push="({path, value, ack}) => $emit('push', {path: ['itemsConsumed', ...path], value, ack})"
      @pull="({path, ack}) => $emit('pull', {path: ['itemsConsumed', ...path], ack})"
    />
    <v-menu
      origin="center center"
      transition="scale-transition"
      location="center"
    >
      <template #activator="{ props }">
        <v-btn
          :loading="addResourceLoading"
          :disabled="addResourceLoading || context.editPermission === false"
          icon
          variant="outlined"
          color="accent"
          v-bind="props"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </template>
      <v-list>
        <v-list-item @click="addCondition">
          <v-list-item-title>Add Condition</v-list-item-title>
        </v-list-item>
        <v-list-item @click="addAttributesConsumed">
          <v-list-item-title>Add Resource</v-list-item-title>
        </v-list-item>
        <v-list-item @click="addItemsConsumed">
          <v-list-item-title>Add Ammo</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
</template>

<script setup>
import { inject, ref } from 'vue';
import AttributesConsumedListForm from '/imports/client/ui/properties/forms/AttributesConsumedListForm.vue';
import ActionConditionsListForm from '/imports/client/ui/properties/forms/ActionConditionsListForm.vue';
import ItemsConsumedListForm from '/imports/client/ui/properties/forms/ItemsConsumedListForm.vue';

defineProps({
  model: {
    type: [Object, Array],
    default: () => ({}),
  },
  errors: {
    type: Object,
    default: () => ({}),
  },
  parentTarget: {
    type: String,
    default: undefined,
  },
  buffsStored: {
    type: Boolean,
  },
});

const emit = defineEmits(['change', 'push', 'pull']);

const context = inject('context', {});

const addResourceLoading = ref(false);

function acknowledgeAddResult() {
  addResourceLoading.value = false;
}

function addAttributesConsumed() {
  addResourceLoading.value = true;
  emit('push', {
    path: ['attributesConsumed'],
    value: { _id: Random.id() },
    ack: acknowledgeAddResult,
  });
}

function addItemsConsumed() {
  addResourceLoading.value = true;
  emit('push', {
    path: ['itemsConsumed'],
    value: { _id: Random.id() },
    ack: acknowledgeAddResult,
  });
}

function addCondition() {
  addResourceLoading.value = true;
  emit('push', {
    path: ['conditions'],
    value: { _id: Random.id() },
    ack: acknowledgeAddResult,
  });
}

</script>

<style lang="css" scoped>

</style>
