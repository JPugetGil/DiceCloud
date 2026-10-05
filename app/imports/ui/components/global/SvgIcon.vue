<template>
  <i
    ref="icon"
    aria-hidden="true"
    class="v-icon"
    :class="themeClasses"
    :style="color && `color: ${color}`"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      :style="`height: ${size}; width: ${size}`"
    >
      <path
        :d="shape"
      />
    </svg>
  </i>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import useThemeState from '/imports/ui/composables/useThemeState';

const SIZE_MAP = {
  default: '24px',
  large: '36px',
  xLarge: '40px',
}

const theme = useThemeState();

const props = defineProps({
  shape: {
    type: String,
    default: '',
  },
  color: {
    type: String,
    default: undefined,
  },
  large: Boolean,
  xLarge: Boolean,
})

const icon = ref(null)
const inheritedSize = ref(undefined)

const themeClasses = computed(() => {
  return {
    'v-theme--dark': theme.isDark,
    'v-theme--light': !theme.isDark,
  }
})

const size = computed(() => {
  if (inheritedSize.value) return inheritedSize.value;
  if (props.large)  return SIZE_MAP['large'];
  if (props.xLarge) return SIZE_MAP['xLarge'];
  return SIZE_MAP['default'];
})

onMounted(() => {
  if (icon.value) {
    inheritedSize.value = icon.value.style.fontSize;
  }
})
</script>

<style lang="css" scoped>
  svg {
    color: inherit;
    fill: currentColor;
  }
</style>
