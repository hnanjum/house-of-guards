import { gsap, ScrollTrigger, prefersReducedMotion } from "./smoothScroll";

/**
 * Motion for `/services` — three small, separate behaviours, none of
 * which is a copy of another module on this site:
 *
 *  1. LOAD sequence on the page opening (`[data-sp-title]`,
 *     `[data-sp-fade]`, `[data-sp-rule]`): the headline rises out of a
 *     clipped line, the supporting copy fades up behind it, and a thin
 *     rule draws itself across. Load-triggered like `heroMuster.ts`,
 *     since the opening is already in view when the page lands.
 *
 *  2. One scroll-triggered entrance PER service row (`[data-sp-row]`):
 *     the row's own rule draws in first, then its icon, name, copy and
 *     list items follow in a short cascade. `toggleActions: "play none
 *     none none"` — plays once on downward entry and never resets,
 *     matching every other reveal on the site.
 *
 *  3. The sticky index (`[data-sp-index-link]`) tracks which row is
 *     currently in the middle of the viewport and marks that link as
 *     `aria-current`. This is state tracking, not an entrance, so it
 *     toggles in both scroll directions on purpose.
 *
 * `prefers-reduced-motion`: everything jumps straight to its final
 * state, no triggers registered for the entrances. The index still
 * tracks the active row (that is navigation state, not motion).
 */
export function initServicesPage() {
  const root = document.querySelector<HTMLElement>("[data-services-page]");
  if (!root) return;

  const reduced = prefersReducedMotion();

  const title = root.querySelector<HTMLElement>("[data-sp-title]");
  const fades = root.querySelectorAll<HTMLElement>("[data-sp-fade]");
  const heroRule = root.querySelector<HTMLElement>("[data-sp-rule]");
  const rows = root.querySelectorAll<HTMLElement>("[data-sp-row]");
  const links = root.querySelectorAll<HTMLAnchorElement>("[data-sp-index-link]");

  if (!reduced) {
    // Hero load sequence.
    if (title) gsap.set(title, { yPercent: 110 });
    gsap.set(fades, { opacity: 0, y: 18 });
    if (heroRule) gsap.set(heroRule, { scaleX: 0, transformOrigin: "left center" });

    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    if (title) tl.to(title, { yPercent: 0, duration: 1.1 });
    if (heroRule) tl.to(heroRule, { scaleX: 1, duration: 1.2, ease: "power2.inOut" }, "-=0.7");
    tl.to(fades, { opacity: 1, y: 0, duration: 0.9, stagger: 0.12 }, "-=0.9");

    // One entrance per row.
    rows.forEach((row) => {
      const rule = row.querySelector<HTMLElement>("[data-sp-row-rule]");
      const icon = row.querySelector<HTMLElement>("[data-sp-row-icon]");
      const parts = row.querySelectorAll<HTMLElement>("[data-sp-row-part]");

      if (rule) gsap.set(rule, { scaleX: 0, transformOrigin: "left center" });
      if (icon) gsap.set(icon, { opacity: 0, y: 14, scale: 0.92 });
      gsap.set(parts, { opacity: 0, y: 22 });

      const rowTl = gsap.timeline({
        defaults: { ease: "power3.out" },
        scrollTrigger: {
          trigger: row,
          start: "top 78%",
          toggleActions: "play none none none",
        },
      });
      if (rule) rowTl.to(rule, { scaleX: 1, duration: 1.1, ease: "power2.inOut" });
      if (icon) rowTl.to(icon, { opacity: 1, y: 0, scale: 1, duration: 0.7 }, "-=0.7");
      rowTl.to(parts, { opacity: 1, y: 0, duration: 0.8, stagger: 0.09 }, "-=0.55");
    });
  }

  // Sticky index: mark the row nearest the middle of the viewport.
  const setActive = (id: string) => {
    links.forEach((a) => {
      if (a.getAttribute("href") === `#${id}`) a.setAttribute("aria-current", "true");
      else a.removeAttribute("aria-current");
    });
  };

  rows.forEach((row) => {
    ScrollTrigger.create({
      trigger: row,
      start: "top 45%",
      end: "bottom 45%",
      onToggle: (self) => {
        if (self.isActive) setActive(row.id);
      },
    });
  });

  if (rows[0]) setActive(rows[0].id);
}
