import { gsap, prefersReducedMotion } from "./smoothScroll";

/**
 * "Muster" — the homepage's one orchestrated load-in moment, per the
 * approved design plan. Not scattered per-section fade-ins: a single
 * short timeline that runs once, then the page is completely still.
 *
 * Re-implemented for the rebuilt full-bleed Hero (the previous version
 * of this file drew a top rule left-to-right and lifted a colour mask
 * off a framed photograph — neither element exists in the new
 * full-bleed-photo-with-overlay-panel design, so both are gone, not
 * left as dead selectors).
 *
 *   1. The three `[data-hero-reveal]` elements (headline, subhead, CTA
 *      row) rise and fade in with a short stagger between them — not
 *      simultaneous (reads as inert) and not staggered word-by-word
 *      (reads as playful, not disciplined).
 *   2. The stat strip's dividers draw themselves in quick succession
 *      as their text settles in, once the hero content has mostly
 *      arrived — unchanged from before; StatStrip.astro's own markup
 *      wasn't touched by the Hero rebuild.
 *
 * This is a LOAD-triggered timeline, not `scrollReveal.ts`'s scroll-
 * triggered one — both the old and new hero sit fully in view on
 * load, so a ScrollTrigger-based reveal has no scroll to trigger off.
 *
 * No bounce/elastic easing anywhere — everything decelerates firmly.
 * With reduced motion requested, every element is set straight to its
 * final state with no animation at all.
 */
export function initHeroMuster(root: ParentNode = document) {
  const reveal = root.querySelectorAll<HTMLElement>("[data-hero-reveal]");
  const dividers = root.querySelectorAll<HTMLElement>("[data-stat-divider] > *");
  const statText = root.querySelectorAll<HTMLElement>("[data-stat-text]");

  if (!reveal.length && !dividers.length && !statText.length) return;

  if (prefersReducedMotion()) {
    if (reveal.length) gsap.set(reveal, { opacity: 1, y: 0 });
    if (dividers.length) gsap.set(dividers, { scaleY: 1 });
    if (statText.length) gsap.set(statText, { opacity: 1 });
    return;
  }

  const tl = gsap.timeline();

  if (reveal.length) tl.set(reveal, { opacity: 0, y: 20 });
  if (dividers.length) tl.set(dividers, { scaleY: 0, transformOrigin: "center" });
  if (statText.length) tl.set(statText, { opacity: 0 });

  if (reveal.length) {
    tl.to(reveal, { opacity: 1, y: 0, duration: 0.55, stagger: 0.12, ease: "power2.out" }, 0.15);
  }
  if (dividers.length) {
    tl.to(dividers, { scaleY: 1, duration: 0.3, stagger: 0.08, ease: "power2.out" }, 0.9);
  }
  if (statText.length) {
    tl.to(statText, { opacity: 1, duration: 0.3, stagger: 0.08, ease: "power2.out" }, 0.9);
  }
}
