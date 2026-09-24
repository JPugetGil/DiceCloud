<template>
  <i
    ref="icon"
    aria-hidden
    role="img"
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
import useThemeState from '/imports/client/ui/utility/useThemeState';

const SIZE_MAP = {
  xSmall: '12px',
  small: '16px',
  default: '24px',
  medium: '28px',
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
  xSmall: Boolean,
  small: Boolean,
  medium: Boolean,
  large: Boolean,
  xLarge: Boolean,
  dark: Boolean,
  light: Boolean,
})

const icon = ref(null)
const inheritedSize = ref(undefined)

const isDark = computed(() => {
  if (props.dark === true) {
    // explicitly dark
    return true
  } else if (props.light === true) {
    // explicitly light
    return false
  } else {
    // inherit from parent, or default false if there is none
    return theme.isDark
  }
})

const themeClasses = computed(() => {
  return {
    'v-theme--dark': isDark.value,
    'v-theme--light': !isDark.value,
  }
})

const size = computed(() => {
  if (inheritedSize.value) return inheritedSize.value;
  if (props.xSmall) return SIZE_MAP['xSmall'];
  if (props.small)  return SIZE_MAP['small'];
  if (props.medium) return SIZE_MAP['medium'];
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
