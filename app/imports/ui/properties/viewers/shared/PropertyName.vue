<template>
  <div class="name text-headline-small mb-2">
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
