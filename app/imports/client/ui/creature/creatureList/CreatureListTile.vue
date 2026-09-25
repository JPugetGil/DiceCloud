<template>
  <draggable
    v-model="dataItems"
    :group="'item-list'"
    :sort="false"
    ghost-class="item-to-creature-ghost"
    draggable=".no-real-items"
    :item-key="item => item?._id || item"
    style="position: relative;"
    @change="dropItem"
  >
    <template #item>
      <div class="no-real-items" />
    </template>
    <template #header>
      <v-list-item
        v-bind="$attrs"
        :class="{
          'text-primary v-list-item--active': isSelected,
          'item-to-creature-drag-over': dragover,
        }"
        :density="dense ? 'compact' : undefined"
        v-on="selection ? { click() { emit('click') } } : {}"
      >
        <template #prepend>
          <v-avatar
            :color="isSelected ? 'red-darken-1' : model.color || 'grey'"
            :size="dense ? 30 : undefined"
            class="text-white"
            style="transition: background 0.3s;"
          >
            <v-fade-transition leave-absolute>
              <v-icon v-if="isSelected">
                mdi-check
              </v-icon>
              <img
                v-else-if="model.avatarPicture"
                :src="model.avatarPicture"
                :alt="model.name"
              >
              <template v-else>
                <span>
                  {{ model.initial }}
                </span>
              </template>
            </v-fade-transition>
          </v-avatar>
        </template>

        <v-list-item-title>
          {{ model.name }}
        </v-list-item-title>
        <v-list-item-subtitle v-if="!dense">
          {{ model.alignment }} {{ model.gender }} {{ model.race }}
        </v-list-item-subtitle>

        <template #append>
          <shared-icon
            v-if="!dense"
            :model="model"
          />
        
          <drag-handle
            v-if="!selection && !dense"
            style="height: 100%; width: 40px;"
          />
        </template>
      </v-list-item>
    </template>
  </draggable>
</template>

<script setup lang="js">
import { ref } from 'vue';
import draggable from 'vuedraggable';
import SharedIcon from '/imports/client/ui/components/SharedIcon.vue';
import { moveBetweenRoots } from '/imports/api/parenting/organizeMethods';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  selection: Boolean,
  isSelected: Boolean,
  dense: Boolean,
});

const emit = defineEmits(['click']);

const dataItems = ref([]);
const dragover = ref(false);

async function dropItem({ added }) {
  const item = added?.element;
  if (!item?._id) return;
  const docRef = { collection: 'creatureProperties', id: item._id };

  // Create the undo function
  const oldRoot = item.root;
  const oldOrder = item.left;
  const undo = async () => {
    try {
      await moveBetweenRoots.callAsync({
        docRef,
        newRootRef: oldRoot,
        newPosition: (oldOrder || 1) - 0.5,
        skipClient: true, // The client will no longer have the doc subscribed, so we can't simulate
      });
    } catch (e) {
      console.error(e);
      snackbar({ text: e.reason || e.message || e.toString() });
    }
  };

  try {
    await moveBetweenRoots.callAsync({
      docRef,
      newRootRef: { collection: 'creatures', id: props.model._id },
      newPosition: 0.5,
    });
    snackbar({
      text: t('characterList.moved', { item: item.name || t('characterList.item'), target: props.model.name || t('characterList.anotherCharacter') }),
      callbackName: 'undo',
      callback: undo,
    });
  } catch (e) {
    console.error(e);
    snackbar({ text: e.reason || e.message || e.toString() });
  }
}
</script>

<style lang="css">
  .item-to-creature-ghost {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    right: 0;
  }
  .item-to-creature-ghost .v-btn {
    display: none;
  }
</style>
