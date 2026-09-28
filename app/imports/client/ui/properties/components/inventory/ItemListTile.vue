<template>
  <v-list-item
    class="item"
    v-on="hasClickListener ? {click} : {}"
  >
    <template #prepend>
      <v-avatar class="item-avatar">
        <property-icon
          class="mr-2"
          :model="model"
          :color="model?.color"
        />
      </v-avatar>
    </template>

    <v-list-item-title>
      {{ title }}
    </v-list-item-title>

    <template #append>
      <div
        v-if="model?.attuned"
        style="min-width: 40px;"
      >
        <v-icon>$spell</v-icon>
      </div>
      <div style="min-width: 40px;">
        <increment-button
          v-if="context.creatureId && model?.showIncrement"
          icon
          color="primary"
          :disabled="context.editPermission === false"
          :value="model?.quantity"
          :loading="incrementLoading"
          @change="changeQuantity"
        />
      </div>
      <div class="drag-handle">
        <drag-handle
          :disabled="context.editPermission === false"
          style="height: 100%; width: 40px; cursor: move;"
        />
      </div>
    </template>
  </v-list-item>
</template>

<script setup>
import { ref, computed, inject, useAttrs } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import PROPERTIES from '/imports/constants/PROPERTIES';
import adjustQuantity from '/imports/api/creature/creatureProperties/methods/adjustQuantity';
import IncrementButton from '/imports/client/ui/components/IncrementButton.vue';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import PropertyIcon from '/imports/client/ui/properties/shared/PropertyIcon.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';

const props = defineProps({
  itemId: {
    type: String,
    required: true,
  },
  selected: Boolean,
  hideIcon: Boolean,
  preparingSpells: Boolean,
});

const emit = defineEmits(['click']);

const context = inject('context', {});
const attrs = useAttrs();

const incrementLoading = ref(false);

const model = autorun(() => CreatureProperties.findOne(props.itemId)).result;

const hasClickListener = computed(() => {
  return !!attrs.onClick;
});

const title = computed(() => {
  const mod = model.value;
  if (!mod) return;
  if (mod.quantity !== 1) {
    if (mod.plural) {
      return `${mod.quantity} ${mod.plural}`;
    } else if (mod.name) {
      return `${mod.quantity} ${mod.name}`;
    }
  } else if (mod.name) {
    return mod.name;
  }
  const prop = PROPERTIES[mod.type];
  return prop && prop.name;
});

function click(e) {
  emit('click', e);
}

async function changeQuantity({ type, value }) {
  incrementLoading.value = true;
  try {
    await adjustQuantity.callAsync({
      _id: model.value._id,
      operation: type,
      value: value
    });
  } catch (error) {
    snackbar({ text: error.reason });
    console.error(error);
  } finally {
    incrementLoading.value = false;
  }
}
</script>

<style lang="css" scoped>
.item-avatar {
  min-width: 32px;
}

.item {
  background-color: inherit;
}
</style>
