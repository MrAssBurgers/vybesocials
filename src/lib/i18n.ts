import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '@/locales/en.json';
import ko from '@/locales/ko.json';
import es from '@/locales/es.json';
import ja from '@/locales/ja.json';
import fr from '@/locales/fr.json';
import de from '@/locales/de.json';
import pt from '@/locales/pt.json';
import zh from '@/locales/zh.json';
import hi from '@/locales/hi.json';
import ar from '@/locales/ar.json';
import ru from '@/locales/ru.json';
import it from '@/locales/it.json';
import tr from '@/locales/tr.json';
import id from '@/locales/id.json';
import th from '@/locales/th.json';
import vi from '@/locales/vi.json';

export const languages = [
  { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย', flag: '🇹🇭' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳' },
] as const;

export type LanguageCode = typeof languages[number]['code'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ko: { translation: ko },
      es: { translation: es },
      ja: { translation: ja },
      fr: { translation: fr },
      de: { translation: de },
      pt: { translation: pt },
      zh: { translation: zh },
      hi: { translation: hi },
      ar: { translation: ar },
      ru: { translation: ru },
      it: { translation: it },
      tr: { translation: tr },
      id: { translation: id },
      th: { translation: th },
      vi: { translation: vi },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['navigator', 'localStorage', 'htmlTag'],
      lookupLocalStorage: 'i18nextLng',
      caches: ['localStorage'],
    },
    supportedLngs: ['en', 'ko', 'es', 'ja', 'fr', 'de', 'pt', 'zh', 'hi', 'ar', 'ru', 'it', 'tr', 'id', 'th', 'vi'],
    load: 'languageOnly',
  });

export default i18n;
