import { gsap, prefersReducedMotion } from "./smoothScroll";

/**
 * "Muster" — the homepage hero's one orchestrated load-in moment, per
 * the approved design plan. Not scattered per-section fade-ins: a
 * single ~1.5s timeline that runs once, then the page is completely
 * still.
 *
 *   1. The rule under the header draws itself left-to-right, like a
 *      straightedge being placed on a letterhead.
 *   2. The headline block rises and fades in as one piece (not
 *      staggered word-by-word — that reads as playful, not
 *      disciplined).
 *   3. A Guard Green Deep mask lifts off the photograph top-to-bottom,
 *      like a cover being lifted off a plate in a case file.
 *   4. The stat strip's dividers draw themselves in quick succession
 *      as their text settles in, like a form being finalised.
 *
 * No bounce/elastic easing anywhere — everything decelerates firmly.
 * With reduced motion requested, every element is set straight to its
 * final state with no animation at all.
 */
export function initHeroMuster(root: ParentNode = document) {
  const rule = root.querySelector<HTMLElement>("[data-muster-rule]");
  const headline = root.querySelectorAll<HTMLElement>("[data-muster-headline]");
  const mask = root.querySelector<HTMLElement>("[data-muster-mask]");
  const dividers = root.querySelectorAll<HTMLElement>("[data-stat-divider] > *");
  const statText = root.querySelectorAll<HTMLElement>("[data-stat-text]");

  if (!rule && !headline.length && !mask && !dividers.length) return;

  if (prefersReducedMotion()) {
    if (rule) gsap.set(rule, { scaleX: 1 });
    if (headline.length) gsap.set(headline, { opacity: 1, y: 0 });
    if (mask) gsap.set(mask, { scaleY: 0 });
    if (dividers.length) gsap.set(dividers, { scaleY: 1 });
    if (statText.length) gsap.set(statText, { opacity: 1 });
    return;
  }

  const tl = gsap.timeline();

  if (rule) tl.set(rule, { scaleX: 0, transformOrigin: "left center" });
  if (headline.length) tl.set(headline, { opacity: 0, y: 10 });
  if (mask) tl.set(mask, { scaleY: 1, transformOrigin: "bottom" });
  if (dividers.length) tl.set(dividers, { scaleY: 0, transformOrigin: "center" });
  if (statText.length) tl.set(statText, { opacity: 0 });

  if (rule) tl.to(rule, { scaleX: 1, duration: 0.55, ease: "power2.out" }, 0);
  if (headline.length) tl.to(headline, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, 0.45);
  if (mask) tl.to(mask, { scaleY: 0, duration: 0.65, ease: "power2.out" }, 0.7);
  if (dividers.length) {
    tl.to(dividers, { scaleY: 1, duration: 0.3, stagger: 0.08, ease: "power2.out" }, 1.2);
  }
  if (statText.length) {
    tl.to(statText, { opacity: 1, duration: 0.3, stagger: 0.08, ease: "power2.out" }, 1.2);
  }
}
