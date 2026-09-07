import { gsap, ScrollTrigger } from "./smoothScroll";

/**
 * Applies a simple GSAP + ScrollTrigger fade/rise-in to every element
 * matching `selector`, scoped to `root` (defaults to the whole document).
 *
 * Intended to be called from a page's own `astro:page-load` handler so it
 * re-runs correctly after View Transitions navigation.
 */
export function initScrollReveal(selector = "[data-reveal]", root: ParentNode = document) {
  const targets = root.querySelectorAll<HTMLElement>(selector);
  if (!targets.length) return;

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
