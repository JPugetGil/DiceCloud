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
      :color="computedColor"
      :theme="isDark ? 'dark' : 'light'"
      class="base-dialog-toolbar"
      :flat="!offsetTop"
    >
      <v-btn
        variant="text"
        icon
        @click="back"
      >
        <v-icon>mdi-arrow-left</v-icon>
      </v-btn>
      <slot name="toolbar" />
      <template #extension>
        <slot

          name="toolbar-extension"
        />
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
import getThemeColor from '/imports/client/ui/utility/getThemeColor';
import isDarkColor from '/imports/client/ui/utility/isDarkColor';
import { useDialogStackStore } from '/imports/client/ui/dialogStack/dialogStackStore';

const props = defineProps({
  color: {
    type: String,
    default: undefined,
  },
  overrideBackButton: {
    type: Function,
    default: undefined,
  },
  darkBody: Boolean,
});

const offsetTop = ref(0);

const dialogStackStore = useDialogStackStore();

const isDark = computed(() => {
  return isDarkColor(computedColor.value);
});

const computedColor = computed(() => {
  return props.color || getThemeColor('secondary');
});

function onScroll(e) {
  offsetTop.value = e.target.scrollTop
}

function back() {
  if (props.overrideBackButton) {
    props.overrideBackButton();
  } else {
    close();
  }
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
  background-color: #fafafa;
}

.v-theme--dark #base-dialog-body.dark-body {
  background-color: #303030;
}
</style>
