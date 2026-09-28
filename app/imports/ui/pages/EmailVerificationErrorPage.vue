<template>
  <div>
    <div class="d-flex flex-1-1 flex-column align-center justify-center">
      <h2 style="margin: 48px 28px 16px">
        {{ $t('email.verificationError') }}
      </h2>
      <h3>
        {{ error }}
      </h3>
    </div>
  </div>
</template>

<script setup>
defineProps({
  error: {
    type: String,
    default: '',
  },
});
</script>

<style lang="css" scoped>
</style>
