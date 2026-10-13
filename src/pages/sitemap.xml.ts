import type { APIRoute } from "astro";
import { SECTORS } from "../data/sectors";
import { getInsights } from "../lib/insights";

/**
 * sitemap.xml for Google Search Console. Public marketing pages only — the
 * portals (/officers, /admin, /client) are signed-in apps and stay out.
 * Add any new public page to PAGES when it is built.
 */
const PAGES = ["/", "/about/", "/services/", "/careers/", "/contact/", "/privacy/", "/insights/", ...SECTORS.map((s) => `/sectors/${s.slug}/`)];

export const GET: APIRoute = async ({ site }) => {
  const posts = await getInsights();
  const urls = [
    ...PAGES.map((path) => `  <url><loc>${new URL(path, site)}</loc></url>`),
    ...posts.map(
      (p) =>
        `  <url><loc>${new URL(`/insights/${p.id}/`, site)}</loc><lastmod>${(p.data.updated ?? p.data.date).toISOString().slice(0, 10)}</lastmod></url>`,
    ),
  ].join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
