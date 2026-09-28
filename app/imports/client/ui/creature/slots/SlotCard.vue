<template>
  <v-card
    v-if="model"
    v-bind="$attrs"
    :data-id="`slot-card-${model._id}`"
    :style="`border: solid 1px ${accentColor};`"
    hover
    class="slot-card d-flex flex-column"
    @mouseover="hover = true"
    @mouseleave="hover = false"
    @click="fillSlot"
  >
    <card-highlight
      :active="hover"
    />
    <v-card-title>
      {{ model.name }}
    </v-card-title>
    <v-card-text v-if="model.description">
      <property-description
        text
        :model="model.description"
      />
    </v-card-text>
    <v-spacer />
    <v-card-actions>
      <v-spacer />
      <v-btn
        variant="text"
        icon
        color="accent"
        @click.stop="ignoreProp"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import { ref, computed, inject } from 'vue';
import { useTheme } from 'vuetify';

import CardHighlight from '/imports/client/ui/components/CardHighlight.vue';
import PropertyDescription from '/imports/client/ui/properties/viewers/shared/PropertyDescription.vue';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import { snackbar } from '/imports/client/ui/components/snackbars/SnackbarQueue';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';
import useThemeState from '/imports/client/ui/utility/useThemeState';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    default: undefined,
  },
});

const theme = useThemeState();
const context = inject('context', {});

const vuetifyTheme = useTheme();

const hover = ref(false);

const accentColor = computed(() => {
  if (props.model?.color) {
    return props.model.color;
  } else if (theme.isDark) {
    return vuetifyTheme.themes.value.dark.colors.primary;
  } else {
    return vuetifyTheme.themes.value.light.colors.primary;
  }
});

function fillSlot() {
  const slotId = props.model._id;
  dialogStackStore.pushDialogStack({
    component: 'slot-fill-dialog',
    elementId: `slot-card-${slotId}`,
    data: {
      slotId,
      creatureId: context.creatureId,
    },
    async callback(nodeIds) {
      if (!nodeIds || !nodeIds.length) return;
      try {
        await insertPropertyFromLibraryNode.callAsync({
          nodeIds,
          parentRef: {
            'id': slotId,
            'collection': 'creatureProperties',
          },
        });
      } catch (error) {
        console.error(error);
        snackbar({ text: error.reason || error.message || error.toString() });
      }
    },
  });
}

async function ignoreProp() {
  try {
    await updateCreatureProperty.callAsync({
      _id: props.model._id,
      path: ['ignored'],
      value: true,
    });
  } catch (error) {
    console.error(error);
    snackbar({ text: error.reason || error.message || error.toString() });
  }
}
</script>
