<template>
  <!--
    The sheet's skeleton until its data is in, then the sheet cross-fades in
    over it, in 150ms (A9)
  -->
  <div
    class="character-sheet-page fill-height"
    :aria-busy="!subReady"
  >
    <transition name="sheet-crossfade">
      <character-sheet-skeleton
        v-if="!subReady"
        key="character-loading"
      />
      <character-sheet
        v-else
        :creature-id="creatureId"
      />
    </transition>
  </div>
</template>

<script setup>
import { computed, watchEffect, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import { subscribe } from 'vue-meteor-tracker';
import CharacterSheet from '/imports/ui/creature/character/CharacterSheet.vue';
import CharacterSheetSkeleton from '/imports/ui/creature/character/CharacterSheetSkeleton.vue';
import { useAppStore } from '/imports/ui/stores/app';

const route = useRoute();
const appStore = useAppStore();

// Through a computed, which only changes with the id: closing a dialog goes
// back in the history, which gives the route new params, and the subscription
// started again, its documents leaving and coming back (a rest confirmed in a
// dialog then lost its action)
const creatureId = computed(() => route.params.id);
const { ready: ready } = subscribe(() => ['singleCharacter', creatureId.value]);
const subReady = computed(() => ready.value);

watchEffect(() => {
  appStore.loadedCharacterId = subReady.value ? creatureId.value : undefined;
});
onBeforeUnmount(() => appStore.loadedCharacterId = undefined);
</script>

<style scoped>
.character-sheet-page {
  position: relative;
}

.sheet-crossfade-enter-active,
.sheet-crossfade-leave-active {
  transition: opacity var(--motion-duration-short) var(--motion-easing-standard);
}

/* The skeleton leaves from under the sheet, which takes its place at once */
.sheet-crossfade-leave-active {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.sheet-crossfade-enter-from,
.sheet-crossfade-leave-to {
  opacity: 0;
}
</style>
