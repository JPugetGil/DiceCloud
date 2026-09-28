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
  dice: {
    type: Array,
    required: true,
  },
  deterministicDiceRoller: {
    type: Function,
    required: true,
  }
});

const model = defineModel({
  type: Array,
  default: () => [],
});

const emit = defineEmits(['continue']);

function rollDice() {
  const values = props.deterministicDiceRoller(props.dice);
  model.value = values;
  emit('continue');
}
</script>
