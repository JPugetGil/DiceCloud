<template>
  <div class="name text-h5 mb-2">
    {{ value }}
  </div>
</template>

<script setup>
defineProps({
  value: {
    type: String,
    default: undefined,
  },
});
</script>
