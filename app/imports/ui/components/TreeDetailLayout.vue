<template>
  <div
    class="d-flex flex-1-1 h-100"
  >
    <div
      v-if="$slots['left-tree']"
      class="tree-column flex-1-1 d-flex flex-column justify-start"
      :style="computedTreeStyle"
    >
      <slot
        name="left-tree"
      />
    </div>
    <v-divider
      v-if="$slots['left-tree']"
      vertical
    />
    <div
      class="tree-column flex-1-1 d-flex flex-column justify-start"
      :style="computedTreeStyle"
    >
      <slot name="tree" />
    </div>
    <template v-if="mdAndUp">
      <v-divider vertical />
      <div
        class="flex-1-1 d-flex flex-column"
        style="background-color: inherit; overflow: hidden; min-height: 100%;"
        data-id="selected-node-card"
      >
        <slot name="detail" />
      </div>
    </template>
  </div>
</template>

<script setup lang="js">
import { computed } from 'vue';
import { useDisplay } from 'vuetify';

const { mdAndUp, smAndDown, xl } = useDisplay();

const computedTreeStyle = computed(() => {
  if (smAndDown.value) return;
  let style = 'flex-shrink: 0; flex-grow: 0; ';
  if (xl.value) {
    style += 'width: 400px;';
  } else {
    style += 'width: 320px;';
  }
  return style;
});
</script>

<style lang="css" scoped>
/*
 * A column fills the width on small screens (flex-1-1); on wider ones the
 * inline style fixes its width, and beats the utility
 */
.tree-column {
  min-width: 0;
}
</style>
