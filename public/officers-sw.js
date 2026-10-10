/*
 * Officers app service worker: keeps the app itself (page, scripts,
 * styles, fonts, logo) on the phone so it opens with no signal. It never
 * caches anything from Supabase (that's another origin, and personal
 * data) — offline records are handled by the app's own outbox.
 *
 * Pages: network first, falling back to the last saved copy.
 * Hashed build files (/_astro/…): saved on first use, then served from
 * the phone (they never change under the same name).
 */
const CACHE = "hg-officers-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("hg-officers-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/__app", copy));
          }
          return res;
        })
        .catch(() => caches.open(CACHE).then((c) => c.match("/__app")).then((r) => r || Response.error())),
    );
    return;
  }

  if (url.pathname.startsWith("/_astro/") || url.pathname.startsWith("/logo/") || /\.(woff2?|svg|png|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
  }
});
