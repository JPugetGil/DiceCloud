<template>
  <v-list-item
    class="item"
    v-on="hasClickListener ? {click} : {}"
  >
    <template #prepend>
      <v-avatar class="item-avatar">
        <property-icon
          class="mr-2"
          :model="item"
          :color="item?.color"
        />
      </v-avatar>
    </template>

    <v-list-item-title>
      {{ title }}
    </v-list-item-title>

    <template #append>
      <div
        v-if="item?.attuned"
        style="min-width: 40px;"
      >
        <v-icon>$spell</v-icon>
      </div>
      <div style="min-width: 40px;">
        <increment-button
          v-if="context.creatureId && item?.showIncrement"
          icon
          color="primary"
          :disabled="context.editPermission === false"
          :value="item?.quantity"
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
import { ref, computed, inject } from 'vue';
import { autorun } from 'vue-meteor-tracker';
import PROPERTIES from '/imports/constants/PROPERTIES';
import adjustQuantity from '/imports/api/creature/creatureProperties/methods/adjustQuantity';
import IncrementButton from '/imports/ui/components/IncrementButton.vue';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import PropertyIcon from '/imports/ui/properties/shared/PropertyIcon.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';

// ItemList passes the item's id (its draggable list holds ids); the folder
// group components pass the document itself, as for every property they show
const props = defineProps({
  itemId: {
    type: String,
    default: undefined,
  },
  model: {
    type: Object,
    default: undefined,
  },
  // The parent's @click listener, declared so that the tile knows whether it is
  // clickable: Vue keeps a declared event's listener out of $attrs.
  // `emit('click')` still calls it.
  onClick: {
    type: Function,
    default: undefined,
  },
});

const emit = defineEmits(['click']);

const context = inject('context', {});

const incrementLoading = ref(false);

const fetchedItem = autorun(() => props.itemId && CreatureProperties.findOne(props.itemId)).result;
const item = computed(() => props.model || fetchedItem.value);

const hasClickListener = computed(() => {
  return !!props.onClick;
});

const title = computed(() => {
  const mod = item.value;
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
      _id: item.value._id,
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
