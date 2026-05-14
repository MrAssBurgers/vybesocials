import { useEffect } from 'react';

interface PageMeta {
  title: string;
  description: string;
  /** Path only (e.g. "/about") or full URL. Defaults to current pathname. */
  canonicalPath?: string;
  ogType?: 'website' | 'article';
  /** Optional JSON-LD object to inject for the lifetime of the page. */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

const SITE = 'https://vybehub.app';

/**
 * Sets per-route SEO tags (title, description, canonical, og:*, twitter:*)
 * by mutating index.html's static head. Restores previous values on unmount.
 *
 * Note: this works for JS-executing crawlers (Googlebot). Non-JS social
 * scrapers (LinkedIn, Slack older clients) still see the index.html defaults.
 */
export function usePageMeta({ title, description, canonicalPath, ogType = 'website', jsonLd }: PageMeta) {
  useEffect(() => {
    const head = document.head;

    const url = canonicalPath
      ? canonicalPath.startsWith('http')
        ? canonicalPath
        : `${SITE}${canonicalPath}`
      : `${SITE}${window.location.pathname}`;

    const setAttr = (selector: string, attr: string, value: string) => {
      const el = head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;
      const prev = el?.getAttribute(attr) ?? null;
      el?.setAttribute(attr, value);
      return () => { if (el && prev !== null) el.setAttribute(attr, prev); };
    };

    const prevTitle = document.title;
    document.title = title;

    const restorers: Array<() => void> = [
      () => { document.title = prevTitle; },
      setAttr('meta[name="description"]', 'content', description),
      setAttr('link[rel="canonical"]', 'href', url),
      setAttr('meta[property="og:title"]', 'content', title),
      setAttr('meta[property="og:description"]', 'content', description),
      setAttr('meta[property="og:url"]', 'content', url),
      setAttr('meta[property="og:type"]', 'content', ogType),
      setAttr('meta[name="twitter:title"]', 'content', title),
      setAttr('meta[name="twitter:description"]', 'content', description),
    ];

    let ldScript: HTMLScriptElement | null = null;
    if (jsonLd) {
      ldScript = document.createElement('script');
      ldScript.type = 'application/ld+json';
      ldScript.dataset.pageMeta = '1';
      ldScript.textContent = JSON.stringify(jsonLd);
      head.appendChild(ldScript);
    }

    return () => {
      restorers.forEach((r) => r());
      if (ldScript && ldScript.parentNode) ldScript.parentNode.removeChild(ldScript);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, canonicalPath, ogType, JSON.stringify(jsonLd)]);
}
