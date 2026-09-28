<template>
  <div
    class="d-flex flex-column justify-center align-center"
    @click="rollDice"
  >
    <p
      v-for="(die, index) in dice"
      :key="index"
    >
      {{ die.number }}d{{ die.diceSize }}
    </p>
  </div>
</template>

<script setup>
const props = defineProps({
  value: {
    type: Array,
    default: () => [],
  },
  dice: {
    type: Array,
    required: true,
  },
  deterministicDiceRoller: {
    type: Function,
    required: true,
  }
});

const emit = defineEmits(['input', 'continue']);

function emitInput(e) {
  e = e || 0;
  emit('input', e);
}

function rollDice() {
  const values = props.deterministicDiceRoller(props.dice);
  emitInput(values);
  emit('continue');
}
</script>
