import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enTranslations } from './en.ts';
import { soTranslations } from './so.ts';

const savedLang = typeof window !== 'undefined' ? localStorage.getItem('bulukeeti_lang') : null;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enTranslations },
    so: { translation: soTranslations },
  },
  lng: savedLang === 'so' || savedLang === 'en' ? savedLang : 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
