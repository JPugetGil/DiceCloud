<template>
  <div>
    <div class="d-flex flex-1-1 flex-column align-center justify-center">
      <h2 style="margin: 48px 28px 16px">
        Email Verification Error
      </h2>
      <h3>
        {{ error.reason || error.message || error }}
      </h3>
    </div>
  </div>
</template>

<script setup>
defineProps({
  error: {
    type: [Object, String],
    default: '',
  },
});
</script>

<style lang="css" scoped>
</style>
