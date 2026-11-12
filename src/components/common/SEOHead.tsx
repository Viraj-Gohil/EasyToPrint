import React, { useEffect } from 'react';
import { CANONICAL_DOMAIN, getSeoForPath, buildJsonLdGraph } from '../../lib/seoConfig';

interface SEOHeadProps {
  currentPath: string;
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
    const ogImageUrl = `${CANONICAL_DOMAIN}/assets/easytoprint-logo-light.png`;

    document.title = seo.title;
    document.documentElement.lang = 'en-IN';

    upsertMetaTag('name', 'description', seo.description);
    upsertMetaTag('name', 'robots', seo.robots);
    upsertMetaTag('name', 'theme-color', '#00B52D');
    upsertCanonicalLink(seo.canonical);

    // Open Graph
    upsertMetaTag('property', 'og:type', seo.ogType || 'website');
    upsertMetaTag('property', 'og:site_name', 'EasyToPrint');
    upsertMetaTag('property', 'og:locale', 'en_IN');
    upsertMetaTag('property', 'og:title', seo.title);
    upsertMetaTag('property', 'og:description', seo.description);
    upsertMetaTag('property', 'og:url', seo.canonical);
    upsertMetaTag('property', 'og:image', ogImageUrl);

    // Twitter Card
    upsertMetaTag('name', 'twitter:card', 'summary_large_image');
    upsertMetaTag('name', 'twitter:title', seo.title);
    upsertMetaTag('name', 'twitter:description', seo.description);
    upsertMetaTag('name', 'twitter:image', ogImageUrl);

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
  }, [currentPath]);

  return null;
};
