import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import { ar } from "@/i18n/locales/ar"
import en from "@/i18n/locales/en"

export const LOCALE_STORAGE_KEY = "qfsd-locale"

function resolveInitialLng(): "ar" | "en" {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === "ar" || stored === "en") return stored
  } catch {
    /* private mode */
  }
  return "ar"
}

const initialLng = resolveInitialLng()

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: initialLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnEmptyString: false,
})

export function setHtmlLangDir(lng: string) {
  const isRtl = lng === "ar"
  document.documentElement.lang = lng
  document.documentElement.dir = isRtl ? "rtl" : "ltr"
}

setHtmlLangDir(initialLng)

export async function setLocale(lng: "ar" | "en") {
  await i18n.changeLanguage(lng)
  setHtmlLangDir(lng)
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, lng)
  } catch {
    /* private mode */
  }
}

export default i18n
