import { gsap, ScrollTrigger, prefersReducedMotion } from "./smoothScroll";

/**
 * `ServicesGrid.astro`'s own scroll-triggered entrance, deliberately
 * separate from `scrollReveal.ts`'s plain fade/rise — this section
 * needed a genuinely different, "premium" effect (scale up from a
 * slight shrink + settle from a few degrees of tilt, not just fade+
 * rise), so it gets its own small module rather than a new option
 * bolted onto the generic one. Same underlying tools as every other
 * scroll-driven entry point in this project (GSAP + ScrollTrigger,
 * riding the Lenis-wired ticker from `smoothScroll.ts`) — no second
 * scroll/animation library introduced.
 *
 * Each card gets its OWN ScrollTrigger (`start: "top 88%"`, matching
 * `scrollReveal.ts`'s own threshold), not one shared trigger for the
 * whole grid — this section sits below the fold, so a genuine scroll
 * trigger (not a load-triggered timeline like the Hero's Muster
 * sequence) is the right mechanism, same reasoning `scrollReveal.ts`'s
 * own comment already gives for StatStrip.
 *
 * Staggering six independent per-element triggers needs an explicit
 * per-card delay, not GSAP's own `stagger` option (that only staggers
 * a single shared timeline/tween across a target array — it has
 * nothing to offset once each card is animating off its own
 * independent trigger instead). `(index % 3) * STAGGER_STEP` gives
 * each ROW its own left-to-right stagger (0, 0.12, 0.24) and repeats
 * for row two — correct for a 3-column desktop grid, since all three
 * cards in one row cross the same "top 88%" scroll threshold at
 * essentially the same scroll position, so the stagger has to come
 * from the delay, not from the trigger timing itself. On the mobile
 * single-column stack this still produces a small, harmless stagger
 * between adjacent cards rather than a meaningful row-based one — an
 * accepted simplification, not a bug: each card still visibly settles
 * on its own turn as it scrolls into view either way, since mobile's
 * own natural scroll-through-one-at-a-time cadence already staggers
 * them for real, the explicit delay is a minor addition on top.
 *
 * Rotation direction alternates by index parity (even cards tilt from
 * -3deg, odd cards from +3deg) rather than every card tilting the same
 * way — reads as more deliberate/considered than a uniform tilt, per
 * the brief's own "premium, not gimmicky" framing.
 *
 * Easing is `power3.out` throughout — firmly decelerating, no bounce/
 * elastic/back easing anywhere, matching this project's sitewide
 * motion rule (see `heroMuster.ts`'s own comment on the same point).
 *
 * With reduced motion requested, every card is set straight to its
 * final flat/full-opacity/full-scale state with no animation and no
 * scroll trigger registered at all — a plain, instant appearance, the
 * same fallback shape `scrollReveal.ts`/`heroMuster.ts` both already
 * use. Unaffected by the REPLAY note below either way — reduced motion
 * always means one static state, never a scroll-driven toggle.
 *
 * REPLAY — `toggleActions: "play none none none"`. PR #26 briefly
 * shipped this as `"play reverse play reverse"` (replay on every
 * re-entry, both directions) — REFINED here so scrolling back UP past
 * an already-played card can never hide/reset it, only a fresh
 * downward `onEnter` ever plays anything. Every position but `onEnter`
 * is `none` — see `scrollReveal.ts`'s own note for the full traced
 * sequence (down plays it, back up leaves it exactly as-is, a later
 * `onEnter` on an already-complete tween is a genuine no-op, not a
 * visible replay). One consequence specific to THIS module, corrected
 * from PR #26's own now-stale claim: each card's own `delay` (its
 * column stagger offset) only ever matters ONCE now, on the single real
 * playthrough — there is no second playthrough for it to "re-apply" on,
 * since nothing ever resets a card back to its pre-animation state
 * once played. The staggered arrival still happens exactly once per
 * card, on its own first scroll-down entry, same as before this
 * refinement — it just never repeats after that, matching every other
 * reveal on the site.
 */
const STAGGER_STEP = 0.12;
const COLUMNS = 3;

export function initServicesGridReveal(selector = "[data-services-reveal]", root: ParentNode = document) {
  const cards = root.querySelectorAll<HTMLElement>(selector);
  if (!cards.length) return;

  if (prefersReducedMotion()) {
    gsap.set(cards, { opacity: 1, scale: 1, rotate: 0 });
    return;
  }

  cards.forEach((card, i) => {
    const tiltFrom = i % 2 === 0 ? -3 : 3;
    gsap.set(card, { opacity: 0, scale: 0.85, rotate: tiltFrom });
    gsap.to(card, {
      opacity: 1,
      scale: 1,
      rotate: 0,
      duration: 0.7,
      delay: (i % COLUMNS) * STAGGER_STEP,
      ease: "power3.out",
      scrollTrigger: {
        trigger: card,
        start: "top 88%",
        toggleActions: "play none none none",
      },
    });
  });
}

export { ScrollTrigger };
