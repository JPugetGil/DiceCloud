<template>
  <div data-id="party-character-picker">
    <v-checkbox
      v-for="character in characters"
      :key="character._id"
      v-model="selected"
      :value="character._id"
      :label="character.name"
      :disabled="!selected.includes(character._id) && selected.length >= MAX_PARTY_CHARACTERS"
      density="compact"
      hide-details
      :data-id="`party-character-${character._id}`"
    />
    <p
      v-if="!characters.length"
      class="text-body-medium text-medium-emphasis my-2"
    >
      {{ $t('party.noOwnCharacters') }}
    </p>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { Meteor } from 'meteor/meteor';
import { autorun, subscribe } from 'vue-meteor-tracker';
import Creatures from '/imports/api/creature/creatures/Creatures';
import { MAX_PARTY_CHARACTERS } from '/imports/api/creature/creatureFolders/methods/partyMethods';

/** Checkboxes of the user's own characters, to bring to a party */
const props = defineProps({
  modelValue: {
    type: Array,
    default: () => [],
  },
});
const emit = defineEmits(['update:modelValue']);

subscribe('characterList');

const characters = autorun(() => Creatures.find(
  { owner: Meteor.userId() }, { sort: { name: 1 }, fields: { name: 1 } },
).fetch()).result;

const selected = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
});
</script>
