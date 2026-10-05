import { ref } from 'vue';

/**
 * What screen readers announce: App.vue keeps a polite live region, present
 * from the start (a region inserted with its text is often not read), that
 * shows the last message given to `announce`.
 */
export const announcement = ref('');

let timer;

export function announce(text) {
  clearTimeout(timer);
  // Emptied first, so that the same message twice is read twice
  announcement.value = '';
  timer = setTimeout(() => { announcement.value = text; }, 50);
}
