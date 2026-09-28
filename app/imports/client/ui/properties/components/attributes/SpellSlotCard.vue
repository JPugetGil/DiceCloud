<template>
  <v-card data-id="spell-slot-card">
    <v-list
      v-if="spellSlots.length"
      lines="two"
    >
      <v-list-subheader>{{ $t('cards.spellSlots') }}</v-list-subheader>
      <spell-slot-list-tile
        v-for="spellSlot in spellSlots"
        :key="spellSlot._id"
        :model="spellSlot"
        :data-id="`spell-slot-card-${spellSlot._id}`"
        @click="clickProperty({_id: spellSlot._id})"
      />
    </v-list>
    <div
      v-if="hasSpells"
      class="d-flex justify-end"
    >
      <v-btn
        color="accent"
        style="width: 100%;"
        variant="outlined"
        data-id="cast-spell-btn"
        @click="castSpell"
      >
        {{ $t('cards.castASpell') }}
      </v-btn>
    </div>
  </v-card>
</template>

<script setup>
import SpellSlotListTile from '/imports/client/ui/properties/components/attributes/SpellSlotListTile.vue';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const dialogStackStore = useDialogStackStore();

const props = defineProps({
  creatureId: {
    type: String,
    required: true,
  },
  hasSpells: Boolean,
  spellSlots: {
    type: Array,
    default: () => [],
  },
});



function castSpell() {
  // push spell cast dialog
  dialogStackStore.pushDialogStack({
    component: 'cast-spell-with-slot-dialog',
    elementId: 'spell-slot-card',
    data: {
      creatureId: props.creatureId,
    },
  });
}

function clickProperty({ _id }) {
  dialogStackStore.pushDialogStack({
    component: 'creature-property-dialog',
    elementId: `spell-slot-card-${_id}`,
    data: { _id },
  });
}
</script>
