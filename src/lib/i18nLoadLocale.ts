import i18n from 'i18next';

/** Dynamic imports — only English ships in the main bundle. */
export const localeLoaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  ko: () => import('@/locales/ko.json'),
  es: () => import('@/locales/es.json'),
  ja: () => import('@/locales/ja.json'),
  fr: () => import('@/locales/fr.json'),
  de: () => import('@/locales/de.json'),
  pt: () => import('@/locales/pt.json'),
  zh: () => import('@/locales/zh.json'),
  ar: () => import('@/locales/ar.json'),
  hi: () => import('@/locales/hi.json'),
  ru: () => import('@/locales/ru.json'),
  it: () => import('@/locales/it.json'),
  nl: () => import('@/locales/nl.json'),
  tr: () => import('@/locales/tr.json'),
  pl: () => import('@/locales/pl.json'),
  sv: () => import('@/locales/sv.json'),
  th: () => import('@/locales/th.json'),
  vi: () => import('@/locales/vi.json'),
  id: () => import('@/locales/id.json'),
  ms: () => import('@/locales/ms.json'),
};

const loading = new Map<string, Promise<void>>();

function normalizeLng(code: string): string {
  return code.split('-')[0].toLowerCase();
}

/** Load a locale bundle if not already present. Safe to call repeatedly. */
export async function ensureLanguageLoaded(code: string): Promise<void> {
  const lng = normalizeLng(code);
  if (lng === 'en') return;
  if (i18n.hasResourceBundle(lng, 'translation')) return;

  const existing = loading.get(lng);
  if (existing) return existing;

  const loader = localeLoaders[lng];
  if (!loader) return;

  const promise = loader()
    .then((mod) => {
      i18n.addResourceBundle(lng, 'translation', mod.default, true, true);
    })
    .catch((err) => {
      console.warn(`[i18n] Failed to load locale "${lng}"`, err);
    })
    .finally(() => {
      loading.delete(lng);
    });

  loading.set(lng, promise);
  return promise;
}

/** Preload browser / stored language after boot (non-blocking). */
export function preloadDetectedLanguage(): void {
  const detected = normalizeLng(i18n.language || 'en');
  if (detected !== 'en') {
    void ensureLanguageLoaded(detected);
  }
}
