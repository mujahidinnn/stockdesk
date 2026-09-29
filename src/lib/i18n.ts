import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import id from "@/locales/id.json";

export const SUPPORTED_LANGUAGES = [
  { code: "id", label: "Indonesia" },
  { code: "en", label: "English" },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

// Profile preference wins (applied by the auth context); before that, the last
// language used on this device survives sign-out, then the browser language.
const LANG_KEY = "stockdesk.lang";
const storedLanguage = (): LangCode | null => {
  try {
    const l = localStorage.getItem(LANG_KEY);
    return l === "id" || l === "en" ? l : null;
  } catch {
    return null;
  }
};
const browserLanguage = (): LangCode =>
  navigator.languages?.some((l) => l.toLowerCase().startsWith("id")) ? "id" : "en";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    id: { translation: id },
  },
  lng: storedLanguage() ?? browserLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on("languageChanged", (l) => {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // Storage blocked: the browser language stays the fallback.
  }
});

export default i18n;
