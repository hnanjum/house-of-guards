import { gsap, prefersReducedMotion } from "./smoothScroll";

/**
 * "Muster" — the homepage hero's one orchestrated load-in moment, per
 * the approved design plan. Not scattered per-section fade-ins: a
 * single short timeline that runs once, then the page is completely
 * still.
 *
 * The three `[data-hero-reveal]` elements (headline, subhead, CTA
 * row) rise and fade in with a short stagger between them — not
 * simultaneous (reads as inert) and not staggered word-by-word (reads
 * as playful, not disciplined).
 *
 * This is a LOAD-triggered timeline, not `scrollReveal.ts`'s scroll-
 * triggered one — the hero sits fully in view on load, so a
 * ScrollTrigger-based reveal has no scroll to trigger off.
 *
 * No bounce/elastic easing anywhere — everything decelerates firmly.
 * With reduced motion requested, every element is set straight to its
 * final state with no animation at all.
 *
 * StatStrip's own reveal used to be sequenced onto the tail end of
 * THIS timeline (its dividers drew themselves in once the hero
 * settled) — that's gone, not just untouched. The StatStrip redesign
 * moved that section's motion to a genuine scroll trigger
 * (`initScrollReveal()`, `scrollReveal.ts`, called separately from
 * `index.astro`), since StatStrip sits below the fold and a
 * load-triggered reveal never made sense for it once it's not
 * guaranteed to be in view at page-load. It also dropped its own
 * vertical dividers entirely as part of that redesign, so the
 * `[data-stat-divider]`/`[data-stat-text]` selectors this file used
 * to query no longer exist anywhere in the markup — removed here
 * rather than left as dead, never-matching selectors.
 */
export function initHeroMuster(root: ParentNode = document) {
  const reveal = root.querySelectorAll<HTMLElement>("[data-hero-reveal]");

  if (!reveal.length) return;

  if (prefersReducedMotion()) {
    gsap.set(reveal, { opacity: 1, y: 0 });
    return;
  }

  gsap.set(reveal, { opacity: 0, y: 20 });
  gsap.to(reveal, { opacity: 1, y: 0, duration: 0.55, stagger: 0.12, ease: "power2.out", delay: 0.15 });
}
