import { createI18n } from 'vue-i18n';
import { en as vuetifyEn, fr as vuetifyFr } from 'vuetify/locale';
import en from '/imports/client/ui/i18n/en.json';
import fr from '/imports/client/ui/i18n/fr.json';

/**
 * The interface's translations. A signed-in user's choice is stored on their
 * account (preferences.language) and followed by AppLayout; before sign-in the
 * last choice made on this browser is used, then the browser's own language.
 * Vuetify's built-in texts (tables, pagination, ...) follow through its
 * vue-i18n adapter (vuetify.js).
 */
export const LANGUAGES = [
  { value: 'en', name: 'English' },
  { value: 'fr', name: 'Français' },
];

const STORAGE_KEY = 'language';
const supported = value => LANGUAGES.some(l => l.value === value);

function initialLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (supported(stored)) return stored;
  } catch {
    // Storage blocked: use the browser language
  }
  const browserLanguage = navigator.language?.slice(0, 2);
  return supported(browserLanguage) ? browserLanguage : 'en';
}

const i18n = createI18n({
  legacy: false,
  locale: initialLocale(),
  fallbackLocale: 'en',
  messages: {
    en: { ...en, $vuetify: vuetifyEn },
    fr: { ...fr, $vuetify: vuetifyFr },
  },
});

document.documentElement.lang = i18n.global.locale.value;

export function setLocale(locale) {
  if (!supported(locale) || i18n.global.locale.value === locale) return;
  i18n.global.locale.value = locale;
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Only this browser forgets the choice
  }
}

// For code outside components: t('key') translates in the current language
export const t = (...args) => i18n.global.t(...args);

// For values stored as data (spell schools...): their message if there is one
export function translateOr(key, fallback) {
  return i18n.global.te(key, 'en') ? i18n.global.t(key) : fallback;
}

// Damage types are stored in English; custom ones are shown as typed
export function damageTypeName(type) {
  return type && translateOr(`damageTypes.${type}`, type);
}

export default i18n;
