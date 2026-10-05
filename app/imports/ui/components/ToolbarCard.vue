<template>
  <v-card
    :hover="hasClickListener"
    class="toolbar-card"
    :class="{'transparent-toolbar': transparentToolbar, hovering}"
    :elevation="hovering ? 3 : undefined"
    @click="$emit('click')"
  >
    <v-toolbar
      flat
      :style="`transform: none; ${hasToolbarClickListener ? 'cursor: pointer;' : ''}`"
      v-bind="transparentToolbar ? {} : userSurface(color)"
      @click="$emit('toolbarclick')"
      @mouseover="hoverToolbar(true)"
      @mouseleave="hoverToolbar(false)"
    >
      <slot name="toolbar" />
    </v-toolbar>
    <div>
      <slot />
    </div>
    <card-highlight :active="hovering" />
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import useUserSurface from '/imports/ui/composables/useUserSurface';
import getThemeColor from '/imports/ui/utility/getThemeColor';
import CardHighlight from '/imports/ui/components/CardHighlight.vue';

// The user's colour as a large surface: its tone for the theme (D2)
const userSurface = useUserSurface();


defineEmits(['click', 'toolbarclick']);

const props = defineProps({
  color: {
    type: String,
    default() {
      return getThemeColor('secondary');
    },
  },
  transparentToolbar: Boolean,
  // The parent's listeners, declared so that the card knows whether it is
  // clickable: Vue keeps a declared event's listeners out of $attrs.
  // `emit()` still calls them.
  onClick: {
    type: Function,
    default: undefined,
  },
  onToolbarclick: {
    type: Function,
    default: undefined,
  },
});

const hovering = ref(false);

const hasClickListener = computed(() => !!props.onClick);
const hasToolbarClickListener = computed(() => !!props.onToolbarclick);

function hoverToolbar(val) {
  hovering.value = !!props.onToolbarclick && val;
}
</script>

<style lang="css">
.toolbar-card .v-toolbar-title {
  font-size: 15px;
}

.toolbar-card {
  transition: box-shadow .4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.toolbar-card.transparent-toolbar .v-theme--dark.v-toolbar.v-sheet {
  background-color: rgb(var(--v-theme-surface));
}
</style>
