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
      <v-btn
        variant="tonal"
        color="primary"
        prepend-icon="mdi-plus"
        :disabled="context.editPermission === false"
        :data-id="`slot-card-choose-${model._id}`"
        @click.stop="fillSlot"
      >
        {{ chooseLabel }}
      </v-btn>
      <v-spacer />
      <v-btn
        variant="text"
        icon
        size="small"
        :aria-label="$t('build.hideCard')"
        :disabled="context.editPermission === false"
        @click.stop="ignoreProp"
      >
        <v-icon>mdi-eye-off-outline</v-icon>
        <v-tooltip
          activator="parent"
          location="top"
          :text="$t('build.hideCardHint')"
        />
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup>
import errorText from '/imports/api/utility/errorText';
import { ref, computed } from 'vue';
import useContext from '/imports/ui/composables/useContext';
import { useTheme } from 'vuetify';

import CardHighlight from '/imports/ui/components/CardHighlight.vue';
import PropertyDescription from '/imports/ui/properties/viewers/shared/PropertyDescription.vue';
import insertPropertyFromLibraryNode from '/imports/api/creature/creatureProperties/methods/insertPropertyFromLibraryNode';
import { snackbar } from '/imports/ui/components/snackbars/SnackbarQueue';
import updateCreatureProperty from '/imports/api/creature/creatureProperties/methods/updateCreatureProperty';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';
import useThemeState from '/imports/ui/composables/useThemeState';
import { useI18n } from 'vue-i18n';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    default: undefined,
  },
});

const theme = useThemeState();
const context = useContext();

const vuetifyTheme = useTheme();

const hover = ref(false);

const { t } = useI18n();

// How many choices the slot still expects, when more than one
const chooseLabel = computed(() => {
  const left = props.model?.spaceLeft;
  return Number.isFinite(left) && left > 1
    ? t('build.chooseCount', { count: left })
    : t('build.choose');
});

const accentColor = computed(() => {
  if (props.model?.color) {
    return props.model.color;
  } else if (theme.isDark) {
    return vuetifyTheme.themes.value.dark.colors.primary;
  } else {
    return vuetifyTheme.themes.value.light.colors.primary;
  }
});

// The card, whose buttons call these, shows only with a slot
function fillSlot() {
  const slotId = /** @type {Record<string, any>} */ (props.model)._id;
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
        snackbar({ text: errorText(error) });
      }
    },
  });
}

async function ignoreProp() {
  try {
    await updateCreatureProperty.callAsync({
      _id: /** @type {Record<string, any>} */ (props.model)._id,
      path: ['ignored'],
      value: true,
    });
  } catch (error) {
    console.error(error);
    snackbar({ text: errorText(error) });
  }
}
</script>
