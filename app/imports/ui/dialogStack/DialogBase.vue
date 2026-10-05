<template>
  <div
    class="d-flex flex-1-1 flex-column"
    style="height: 100%;"
  >
    <slot
      name="replace-toolbar"
      :flat="!offsetTop"
    />
    <v-toolbar
      v-if="!$slots['replace-toolbar']"
      v-bind="userSurface(computedColor)"
      class="base-dialog-toolbar"
      :flat="!offsetTop"
    >
      <v-btn
        variant="text"
        icon
        :aria-label="$t('common.back')"
        data-id="dialog-back"
        @click="close"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <slot name="toolbar" />
      <!-- A declared extension reserves its row even when empty -->
      <template
        v-if="$slots['toolbar-extension']"
        #extension
      >
        <slot name="toolbar-extension" />
      </template>
    </v-toolbar>
    <div
      v-if="$slots['unwrapped-content']"
      id="base-dialog-body"
      class="unwrapped-content"
      @scroll.passive="onScroll"
    >
      <slot name="unwrapped-content" />
    </div>
    <v-card-text
      v-else
      id="base-dialog-body"
      :class="{'dark-body': darkBody}"
      @scroll.passive="onScroll"
    >
      <slot />
    </v-card-text>
    <v-card-actions v-if="$slots.actions">
      <slot name="actions" />
    </v-card-actions>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import getThemeColor from '/imports/ui/utility/getThemeColor';
import useUserSurface from '/imports/ui/composables/useUserSurface';
import { useDialogStackStore } from '/imports/ui/stores/dialogStack';

// The user's colour as a large surface: its tone for the theme (D2)
const userSurface = useUserSurface();

const props = defineProps({
  color: {
    type: String,
    default: undefined,
  },
  darkBody: Boolean,
});

const offsetTop = ref(0);

const dialogStackStore = useDialogStackStore();

const computedColor = computed(() => {
  return props.color || getThemeColor('secondary');
});

function onScroll(e) {
  offsetTop.value = e.target.scrollTop
}

function close() {
  dialogStackStore.popDialogStack();
}
</script>

<style scoped>
.base-dialog-toolbar {
  z-index: 2;
  border-radius: 2px 2px 0 0;
}

#base-dialog-body,
.unwrapped-content {
  flex-grow: 1;
  overflow: auto;
}

#base-dialog-body.dark-body {
  background-color: rgb(var(--v-theme-raised));
}

.v-theme--dark #base-dialog-body.dark-body {
  background-color: rgb(var(--v-theme-surface));
}
</style>
