import { computed, reactive } from 'vue';
import { useTheme } from 'vuetify';

/**
 * The `{ isDark }` object components style themselves with.
 *
 * Vuetify 2's v-app provided `theme: { isDark }` to every descendant, and these
 * components read it with `inject('theme')`. Vuetify 3 provides no such object —
 * its theme sits behind an internal symbol — so that inject always fell back to
 * `{ isDark: false }` and dark mode rendered with light-theme styling. This builds
 * the same shape from Vuetify 3's `useTheme()`, which, like the old inject, follows
 * the nearest `theme` a parent sets.
 */
export default function useThemeState() {
  const theme = useTheme();
  return reactive({
    isDark: computed(() => theme.current.value.dark),
  });
}
