<template>
  <div
    class="d-flex flex-1-1"
    style="height: 100%;"
  >
    <div
      v-if="$slots['left-tree']"
      class="tree-column d-flex flex-column justify-start"
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
      class="tree-column d-flex flex-column justify-start"
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
 * Fills the width on small screens; on wider ones the inline style fixes it.
 * Not Vuetify 3's flex-1-1 utility: it is !important and beat the inline width,
 * so every tree column grew. Vuetify 2's .layout, used here before, was not.
 */
.tree-column {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
