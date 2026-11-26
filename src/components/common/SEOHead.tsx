import React, { useEffect } from 'react';
import { OG_IMAGE_URL, DEFAULT_OG_IMAGE_ALT, getSeoForPath, buildJsonLdGraph } from '../../lib/seoConfig';

interface SEOHeadProps {
  currentPath: string;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __easyToPrintGaInitialized?: string;
  }
}

function upsertMetaTag(attrName: 'name' | 'property', attrValue: string, content: string) {
  let el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function removeMetaTag(attrName: 'name' | 'property', attrValue: string) {
  const el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (el) el.remove();
}

function upsertCanonicalLink(href: string) {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

export const SEOHead: React.FC<SEOHeadProps> = ({ currentPath }) => {
  useEffect(() => {
    const seo = getSeoForPath(currentPath);
    const resolvedOgImage = seo.ogImage || OG_IMAGE_URL;
    const resolvedOgImageAlt = seo.ogImageAlt || DEFAULT_OG_IMAGE_ALT;

    document.title = seo.title;
    document.documentElement.lang = 'en-IN';

    upsertMetaTag('name', 'description', seo.description);
    upsertMetaTag('name', 'robots', seo.robots);
    upsertMetaTag('name', 'theme-color', '#00B52D');
    upsertCanonicalLink(seo.canonical);

    const gscVerification = (import.meta.env.VITE_GSC_VERIFICATION || '').trim();
    if (gscVerification) {
      upsertMetaTag('name', 'google-site-verification', gscVerification);
    }

    // Open Graph
    upsertMetaTag('property', 'og:type', seo.ogType || 'website');
    upsertMetaTag('property', 'og:site_name', 'EasyToPrint');
    upsertMetaTag('property', 'og:locale', 'en_IN');
    upsertMetaTag('property', 'og:title', seo.title);
    upsertMetaTag('property', 'og:description', seo.description);
    upsertMetaTag('property', 'og:url', seo.canonical);
    upsertMetaTag('property', 'og:image', resolvedOgImage);
    upsertMetaTag('property', 'og:image:width', '1200');
    upsertMetaTag('property', 'og:image:height', '630');
    upsertMetaTag('property', 'og:image:alt', resolvedOgImageAlt);

    if (seo.ogType === 'article' && seo.articleMeta) {
      upsertMetaTag('property', 'article:published_time', seo.articleMeta.datePublished);
      upsertMetaTag('property', 'article:modified_time', seo.articleMeta.dateModified);
      upsertMetaTag('property', 'article:section', seo.articleMeta.section);
    } else {
      removeMetaTag('property', 'article:published_time');
      removeMetaTag('property', 'article:modified_time');
      removeMetaTag('property', 'article:section');
    }

    // Twitter Card
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', seo.title);
    upsertMetaTag('name', 'twitter:description', seo.description);
    upsertMetaTag('name', 'twitter:image', resolvedOgImage);
    upsertMetaTag('name', 'twitter:image:alt', resolvedOgImageAlt);

    // JSON-LD Structured Data (only on indexable public pages)
    const existingScript = document.getElementById('easytoprint-jsonld');
    if (seo.robots === 'index, follow') {
      const jsonLd = buildJsonLdGraph(seo);
      let scriptEl = existingScript as HTMLScriptElement | null;
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = 'easytoprint-jsonld';
        scriptEl.type = 'application/ld+json';
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(jsonLd);
    } else if (existingScript) {
      existingScript.remove();
    }

    // Optional Google Analytics 4 (only initialized when VITE_GA_MEASUREMENT_ID is configured)
    const gaId = (import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
    if (gaId && /^G-[A-Z0-9]+$/i.test(gaId) && seo.robots === 'index, follow') {
      if (window.__easyToPrintGaInitialized !== gaId) {
        window.__easyToPrintGaInitialized = gaId;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function gtag(...args: unknown[]) {
          window.dataLayer!.push(args);
        };
        window.gtag('js', new Date());
        window.gtag('config', gaId, { send_page_view: false });

        if (!document.getElementById('easytoprint-ga4-script')) {
          const gaScript = document.createElement('script');
          gaScript.id = 'easytoprint-ga4-script';
          gaScript.async = true;
          gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
          document.head.appendChild(gaScript);
        }
      }
      if (typeof window.gtag === 'function') {
        window.gtag('event', 'page_view', {
          page_title: seo.title,
          page_location: seo.canonical,
          page_path: seo.path
        });
      }
    }
  }, [currentPath]);

  return null;
};
