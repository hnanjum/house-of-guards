import { gsap, ScrollTrigger, prefersReducedMotion } from "./smoothScroll";

/**
 * Applies a simple GSAP + ScrollTrigger fade/rise-in to every element
 * matching `selector`, scoped to `root` (defaults to the whole document).
 *
 * Intended to be called from a page's own `astro:page-load` handler so it
 * re-runs correctly after View Transitions navigation.
 *
 * REPLAY — `toggleActions: "play none none none"`. PR #26 briefly
 * shipped this as `"play reverse play reverse"` (replay on every
 * re-entry, both directions) — REFINED here, on direct feedback: once
 * an element has played, scrolling back UP past it must never hide/
 * reset it, only ever animate IN on a fresh downward entry. Every
 * position but `onEnter` is `none`, so nothing ever reverses this once
 * it's played, regardless of scroll direction — `onLeaveBack`
 * (scrolling up past `start`) does NOT reverse it (that's the one
 * `"play none none reverse"` would have done, and is explicitly NOT
 * what was asked for). Traced end to end, not just asserted: scroll
 * down past the trigger → `onEnter` → plays. Scroll back up past it →
 * `onLeaveBack` → `none` → the tween's progress is untouched, so the
 * element stays exactly as it settled (visible, at its final state) —
 * it does not hide. Scroll down again → `onEnter` fires again (the
 * boundary-crossing detection itself is unconditional; only the ACTION
 * taken depends on `toggleActions`) → `play` is invoked again, but the
 * tween is already at progress 1 with nothing left to animate forward
 * through, so this is a genuine no-op — no visible replay, the element
 * simply stays in its already-played state. Net effect: functionally
 * identical to a strict one-shot-per-page-load reveal, same as this
 * project had before PR #26 — a deliberate, disclosed outcome of this
 * refinement, not an accidental full revert. See `servicesGridReveal
 * .ts`/`missionReveal.ts`/`sectorsGridReveal.ts`'s own matching notes;
 * applied uniformly across every scroll-triggered reveal on the site so
 * no section behaves differently from its neighbours.
 *
 * When reduced motion is requested, elements are set straight to their
 * final visible state with no animation at all — the CSS transition
 * reset in global.css can't reach a GSAP tween, so this is checked
 * explicitly. Unaffected by the above either way — reduced motion is
 * always one instant, static, non-animated state.
 */
export function initScrollReveal(selector = "[data-reveal]", root: ParentNode = document) {
  const targets = root.querySelectorAll<HTMLElement>(selector);
  if (!targets.length) return;

  if (prefersReducedMotion()) {
    gsap.set(targets, { opacity: 1, y: 0 });
    return;
  }

  gsap.set(targets, { opacity: 0, y: 24 });

  targets.forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: "power2.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none none",
      },
    });
  });
}

export { ScrollTrigger };
