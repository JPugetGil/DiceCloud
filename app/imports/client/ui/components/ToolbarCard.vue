<template>
  <v-card
    :hover="hasClickListener"
    class="toolbar-card"
    :class="{'transparent-toolbar': transparentToolbar, hovering}"
    :elevation="hovering ? 8 : undefined"
    @click="$emit('click')"
  >
    <v-toolbar
      flat
      :style="`transform: none; ${hasToolbarClickListener ? 'cursor: pointer;' : ''}`"
      :class="{}"
      :color="transparentToolbar ? undefined : color"
      :theme="transparentToolbar ? undefined : isDark ? 'dark' : 'light'"
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
import { ref, computed, useAttrs } from 'vue';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';
import getThemeColor from '/imports/client/ui/utility/getThemeColor';
import CardHighlight from '/imports/client/ui/components/CardHighlight.vue';


defineEmits(['click', 'toolbarclick']);

const props = defineProps({
  color: {
    type: String,
    default() {
      return getThemeColor('secondary');
    },
  },
  transparentToolbar: Boolean,
});

const attrs = useAttrs();

const hovering = ref(false);

const isDark = computed(() => isDarkColor(props.color));
const hasClickListener = computed(() => !!attrs.onClick);
const hasToolbarClickListener = computed(() => !!attrs.onToolbarclick);

function hoverToolbar(val) {
  hovering.value = !!attrs.onToolbarclick && val;
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
  background-color: #303030;
}
</style>
