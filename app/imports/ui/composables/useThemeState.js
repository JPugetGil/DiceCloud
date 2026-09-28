import { computed, reactive } from 'vue';
import { useTheme } from 'vuetify';

/**
 * The `{ isDark }` object components style themselves with. It follows
 * Vuetify's `useTheme()`, so the nearest `theme` a parent sets.
 */
export default function useThemeState() {
  const theme = useTheme();
  return reactive({
    isDark: computed(() => theme.current.value.dark),
  });
}
