import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CANONICAL_DOMAIN,
  PUBLIC_SEO_ROUTES,
  LEGACY_SEO_REDIRECTS,
  getSeoForPath,
  getLegacyRedirectTarget,
  buildJsonLdGraph,
  buildSitemapXml,
  buildRobotsTxt,
  isPrivateNoIndexPath
} from '../src/lib/seoConfig.js';
import { FEATURE_LANDING_PAGES } from '../src/lib/featurePagesData.js';
import { BLOG_POSTS } from '../src/lib/blogData.js';
import { ADMIN_BASE_PATH } from '../src/lib/adminConfig.js';

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    throw err;
  }
}

console.log('Running EasyToPrint SEO Audit Validation Suite...\n');

test('Homepage has exact target title and meta description', () => {
  const home = getSeoForPath('/');
  assert.equal(home.title, 'EasyToPrint – Print Shop Management Software in India');
  assert.equal(
    home.description,
    'Manage your printing and xerox shop digitally with EasyToPrint. Accept QR-based print orders, online payments, automate print jobs and manage printers with ease.'
  );
  assert.equal(home.canonical, `${CANONICAL_DOMAIN}/`);
  assert.equal(home.robots, 'index, follow');
});

test('All 6 canonical feature landing pages exist and are registered', () => {
  const expectedPaths = [
    '/print-shop-management-software',
    '/xerox-shop-management-software',
    '/qr-code-printing-orders',
    '/online-print-order-management',
    '/print-job-automation',
    '/print-agent-software'
  ];
  assert.equal(FEATURE_LANDING_PAGES.length, 6);
  for (const p of expectedPaths) {
    const seo = getSeoForPath(p);
    assert.equal(seo.robots, 'index, follow');
    assert.equal(seo.canonical, `${CANONICAL_DOMAIN}${p}`);
    assert.ok(seo.faqItems && seo.faqItems.length >= 3, `${p} must define page-specific FAQs`);
  }
});

test('All 10 requested SEO blog articles exist with WebP + JPG images and ALT tags', () => {
  const expectedSlugs = [
    'best-print-shop-management-software-in-india',
    'how-to-digitize-your-xerox-shop-in-2026',
    'how-qr-code-printing-orders-work',
    'how-to-automate-a-digital-printing-business',
    'benefits-of-online-printing-orders-for-local-print-shops',
    'how-to-manage-multiple-printers-in-a-printing-shop',
    'traditional-xerox-shop-vs-digital-print-shop',
    'how-to-reduce-manual-work-in-a-photocopy-business',
    'how-online-payments-improve-print-shop-operations',
    'complete-guide-to-print-shop-automation'
  ];
  assert.equal(BLOG_POSTS.length, 10);
  for (const slug of expectedSlugs) {
    const post = BLOG_POSTS.find((b) => b.slug === slug);
    assert.ok(post, `Missing blog slug: ${slug}`);
    assert.ok(post.imageWebp.endsWith('.webp'), `Blog ${slug} must use WebP image`);
    assert.ok(post.imageAlt.length > 20, `Blog ${slug} must have descriptive ALT text`);
    assert.ok(post.imageWidth > 0 && post.imageHeight > 0, `Blog ${slug} must define width & height`);
    assert.ok(fs.existsSync(path.resolve('public', post.imageWebp.replace(/^\//, ''))), `Missing asset: ${post.imageWebp}`);
    assert.ok(fs.existsSync(path.resolve('public', post.imageJpg.replace(/^\//, ''))), `Missing asset: ${post.imageJpg}`);
  }
});

test('Crawlable legal pages (/privacy, /terms, /refund-policy) are indexable with unique metadata', () => {
  for (const p of ['/privacy', '/terms', '/refund-policy']) {
    const seo = getSeoForPath(p);
    assert.equal(seo.robots, 'index, follow');
    assert.equal(seo.canonical, `${CANONICAL_DOMAIN}${p}`);
    assert.ok(seo.title.includes('EasyToPrint'));
  }
});

test('Zero duplicate titles or meta descriptions across all 27 public routes', () => {
  const routes = Object.values(PUBLIC_SEO_ROUTES);
  assert.equal(routes.length, 27, `Expected 27 canonical public routes, got ${routes.length}`);
  const titles = new Set<string>();
  const descs = new Set<string>();
  for (const r of routes) {
    assert.ok(!titles.has(r.title), `Duplicate title found: ${r.title}`);
    assert.ok(!descs.has(r.description), `Duplicate description found: ${r.description}`);
    assert.ok(r.title.length >= 35 && r.title.length <= 75, `Title length check failed (${r.title.length}): ${r.title}`);
    assert.ok(
      r.description.length >= 110 && r.description.length <= 175,
      `Description length check failed (${r.description.length}): ${r.description}`
    );
    titles.add(r.title);
    descs.add(r.description);
  }
});

test('All 7 legacy feature & blog URLs resolve to valid canonical 301 redirect targets', () => {
  const entries = Object.entries(LEGACY_SEO_REDIRECTS);
  assert.equal(entries.length, 7);
  for (const [oldPath, newPath] of entries) {
    assert.equal(getLegacyRedirectTarget(oldPath), newPath);
    assert.equal(getLegacyRedirectTarget(`${oldPath}/`), newPath);
    assert.ok(PUBLIC_SEO_ROUTES[newPath], `Redirect target not in PUBLIC_SEO_ROUTES: ${newPath}`);
  }
});

test('Private dashboards, auth routes, customer QR flows, and admin paths are strictly noindex, nofollow', () => {
  const privatePaths = [
    '/auth/login',
    '/auth/register',
    '/login',
    '/register',
    '/shop/dashboard',
    '/shop/print-jobs',
    '/dashboard',
    '/admin',
    `${ADMIN_BASE_PATH}/dashboard`,
    '/track-print',
    '/s/demo-shop',
    '/print/demo-shop'
  ];
  for (const p of privatePaths) {
    assert.equal(isPrivateNoIndexPath(p), true, `${p} must be classified private`);
    const seo = getSeoForPath(p);
    assert.equal(seo.robots, 'noindex, nofollow', `${p} must be noindex, nofollow`);
  }
});

test('Unknown URLs return 404 flag and noindex, nofollow', () => {
  const seo = getSeoForPath('/non-existent-random-page-xyz');
  assert.equal(seo.isNotFound, true);
  assert.equal(seo.robots, 'noindex, nofollow');
});

test('JSON-LD schemas are valid, factual, and contain zero fabricated ratings/reviews/addresses', () => {
  const homeGraph = buildJsonLdGraph(getSeoForPath('/'));
  const homeStr = JSON.stringify(homeGraph);
  assert.ok(homeStr.includes('"@type":"Organization"'));
  assert.ok(homeStr.includes('"@type":"WebSite"'));
  assert.ok(homeStr.includes('"@type":"SoftwareApplication"'));
  assert.ok(homeStr.includes('"@type":"FAQPage"'));
  assert.ok(!homeStr.includes('aggregateRating'), 'Must not contain fabricated aggregateRating');
  assert.ok(!homeStr.includes('reviewCount'), 'Must not contain fabricated reviewCount');
  assert.ok(!homeStr.includes('98765 43210'), 'Must not contain placeholder phone number');

  const pricingGraph = buildJsonLdGraph(getSeoForPath('/pricing'));
  assert.ok(JSON.stringify(pricingGraph).includes('"@type":"Offer"'));

  const blogGraph = buildJsonLdGraph(getSeoForPath('/blog/how-qr-code-printing-orders-work'));
  assert.ok(JSON.stringify(blogGraph).includes('"@type":"Article"'));
  assert.ok(JSON.stringify(blogGraph).includes('"@type":"BreadcrumbList"'));
});

test('Static public/sitemap.xml and public/robots.txt match dynamic builders byte-for-byte', () => {
  const staticSitemap = fs.readFileSync(path.resolve('public/sitemap.xml'), 'utf-8');
  const dynamicSitemap = buildSitemapXml('2026-04-12');
  assert.equal(staticSitemap, dynamicSitemap);
  assert.equal((staticSitemap.match(/<loc>/g) || []).length, 27);
  assert.ok(!staticSitemap.includes('/admin'));
  assert.ok(!staticSitemap.includes(ADMIN_BASE_PATH));
  assert.ok(!staticSitemap.includes('/shop/'));

  const staticRobots = fs.readFileSync(path.resolve('public/robots.txt'), 'utf-8');
  const dynamicRobots = buildRobotsTxt();
  assert.equal(staticRobots, dynamicRobots);
  assert.ok(!staticRobots.includes(ADMIN_BASE_PATH), 'robots.txt must not leak obscured admin path');
  assert.ok(staticRobots.includes(`Sitemap: ${CANONICAL_DOMAIN}/sitemap.xml`));
});

test('No fabricated placeholder phone numbers exist in public marketing components', () => {
  const filesToCheck = [
    'src/components/layout/Footer.tsx',
    'src/components/layout/FooterLegalModal.tsx',
    'src/components/layout/Navbar.tsx',
    'src/components/layout/NavbarModals.tsx',
    'src/components/public/PublicSeoPages.tsx',
    'src/components/landing/LandingPage.tsx',
    'index.html'
  ];
  for (const rel of filesToCheck) {
    const content = fs.readFileSync(path.resolve(rel), 'utf-8');
    assert.ok(!content.includes('98765 43210') && !content.includes('9876543210'), `Placeholder phone found in ${rel}`);
  }
});

console.log(`\nAll ${passed} SEO audit validation tests passed!`);
