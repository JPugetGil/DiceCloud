<template>
  <v-list
    lines="two"
    density="compact"
    class="spell-list"
  >
    <template
      v-for="spell in computedSpells"
      :key="spell.isSubheader ? `${spell.level}-header` : spell._id"
    >
      <v-list-subheader
        v-if="spell.isSubheader"
        class="item"
      >
        {{ spell.level === 0 ? 'Cantrips' : `Level ${spell.level}` }}
      </v-list-subheader>
      <spell-list-tile
        v-else
        class="item"
        :disabled="context.editPermission === false"
        :data-id="`spell-list-tile-${spell._id}`"
        :model="spell"
        :preparing-spells="preparingSpells"
        @click="clickProperty(spell._id)"
      />
    </template>
  </v-list>
</template>

<script setup>
import { computed, inject } from 'vue';
import SpellListTile from '/imports/client/ui/properties/components/spells/SpellListTile.vue';
import spellsWithSubheaders from '/imports/client/ui/properties/components/spells/spellsWithSubheaders';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  spells: {
    type: Array,
    default: () => [],
  },
  preparingSpells: Boolean,
});

const context = inject('context', {});

const computedSpells = computed(() => {
  return spellsWithSubheaders(props.spells);
});

function clickProperty(_id) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `spell-list-tile-${_id}`,
    data: { _id },
  });
}
</script>
