import { gsap, ScrollTrigger, prefersReducedMotion } from "./smoothScroll";

/**
 * Applies a simple GSAP + ScrollTrigger fade/rise-in to every element
 * matching `selector`, scoped to `root` (defaults to the whole document).
 *
 * Intended to be called from a page's own `astro:page-load` handler so it
 * re-runs correctly after View Transitions navigation.
 *
 * REPLAY — `toggleActions: "play reverse play reverse"` (was
 * `"play none none none"`, a one-shot reveal). Same idiom applied
 * uniformly across every scroll-triggered reveal on the site (see
 * `servicesGridReveal.ts`/`missionReveal.ts`/`sectorsGridReveal.ts`'s
 * own matching notes) so no section replays while its neighbours don't.
 * `onEnter`/`onLeaveBack` are the two positions that actually matter in
 * practice — crossing `start` scrolling down plays it, crossing `start`
 * scrolling back up reverses it — since neither `end` nor `endTrigger`
 * is set here, ScrollTrigger's own documented default makes `end`
 * resolve to the BOTTOM of the whole scrollable page, not this
 * element's own bottom edge, so the `onLeave`/`onEnterBack` positions
 * are effectively inert for a mid-page section (they'd only fire if a
 * visitor scrolled to the literal bottom of the page while still past
 * this element). `reverse` is still the correct value for both —
 * harmless where it never fires, and the semantically right behaviour
 * on the rare occasion it does. GSAP reverses an in-progress tween from
 * its current progress, not by restarting it, so rapid back-and-forth
 * scrolling across the trigger boundary just makes it "chase" whichever
 * direction is current — no jank, no re-triggering mid-tween.
 *
 * When reduced motion is requested, elements are set straight to their
 * final visible state with no animation at all — the CSS transition
 * reset in global.css can't reach a GSAP tween, so this is checked
 * explicitly. Untouched by the replay change above — reduced motion
 * still means one instant, static, non-animated state, never a
 * scroll-position-driven toggle either direction.
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
        toggleActions: "play reverse play reverse",
      },
    });
  });
}

export { ScrollTrigger };
