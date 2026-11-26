import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import ar from './ar';

export type Lang = 'en' | 'ar';
const STORAGE_KEY = 'whrmis.lang';

/** True if the user explicitly picked a language on this device. */
export function hasStoredLanguage(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; }
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ar') return saved;
  } catch { /* storage unavailable */ }
  return navigator.language?.startsWith('ar') ? 'ar' : 'en';
}

export function applyDocumentDirection(lang: Lang) {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

/** Changes UI language only; persisted per device. Records are never touched. */
export async function setLanguage(lang: Lang) {
  await i18n.changeLanguage(lang);
  applyDocumentDirection(lang);
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
}

const lang = initialLang();
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnObjects: true,
});
applyDocumentDirection(lang);

export default i18n;
