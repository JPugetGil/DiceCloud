<template>
  <toolbar-card
    :color="model.color"
    :data-id="model._id"
    @toolbarclick="clickSpellList(model._id)"
  >
    <template #toolbar>
      <v-toolbar-title
        v-if="!preparingSpells"
      >
        {{ model.name }}
      </v-toolbar-title>
      <v-spacer v-if="!preparingSpells && preparedError" />
      <v-toolbar-title
        v-if="preparingSpells || preparedError"
        :class="{'text-error' : preparedError}"
      >
        {{ $t('cards.spellsPrepared', { prepared: numPrepared, max: model.maxPrepared && model.maxPrepared.value || 0 }) }}
      </v-toolbar-title>
      <v-spacer />
      <v-menu
        v-if="!preparingSpells"
        location="bottom left"

        transition="slide-y-transition"
        style="margin-right: -12px;"
      >
        <template #activator="{ props: activatorProps }">
          <v-btn
            variant="text"
            icon
            v-bind="activatorProps"
            @click.stop
          >
            <v-icon>mdi-dots-vertical</v-icon>
          </v-btn>
        </template>
        <v-list class="pa-2">
          <v-switch
            v-model="preparingSpells"
            class="ma-2"
            :label="$t('cards.changePrepared')"
            hide-details
          />
        </v-list>
      </v-menu>
      <v-btn
        v-else
        variant="text"
        icon
        @click.stop="preparingSpells = false"
      >
        <v-icon>mdi-check</v-icon>
      </v-btn>
    </template>
    <spell-list
      :spells="spells"
      :preparing-spells="preparingSpells"
    />
  </toolbar-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import { autorun } from 'vue-meteor-tracker';

import ToolbarCard from '/imports/client/ui/components/ToolbarCard.vue';
import SpellList from '/imports/client/ui/properties/components/spells/SpellList.vue';
import CreatureProperties from '/imports/api/creature/creatureProperties/CreatureProperties';
import { getFilter } from '/imports/api/parenting/parentingFunctions';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  model: {
    type: Object,
    required: true,
  },
  organize: Boolean,
});


const preparingSpells = ref(false);

const spells = autorun(() => {
  let filter = {
    ...getFilter.descendants(props.model),
    type: 'spell',
    removed: { $ne: true },
  };
  if (preparingSpells.value) {
    filter.deactivatedByAncestor = { $ne: true };
    filter.deactivatedByToggle = { $ne: true };
  } else {
    filter.inactive = { $ne: true };
  }
  return CreatureProperties.find(filter, {
    sort: {
      level: 1,
      left: 1,
    }
  }).fetch();
}).result;

const numPrepared = autorun(() => {
  return CreatureProperties.find({
    ...getFilter.descendants(props.model),
    type: 'spell',
    removed: { $ne: true },
    prepared: true,
    alwaysPrepared: { $ne: true },
    deactivatedByAncestor: { $ne: true },
    deactivatedByToggle: { $ne: true },
  }).count();
}).result;

const preparedError = computed(() => {
  if (!props.model.maxPrepared) return;
  let prepared = numPrepared.value;
  let maxPrepared = props.model.maxPrepared.value || 0;
  return prepared !== maxPrepared;
});

function clickSpellList(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `${_id}`,
    data: { _id },
  });
}
</script>

<style lang="css" scoped>

</style>
