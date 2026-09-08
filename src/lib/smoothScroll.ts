import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let tick: ((time: number) => void) | null = null;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Initializes Lenis smooth scrolling and wires it into GSAP's ticker so
 * ScrollTrigger stays in sync with Lenis's own scroll position instead of
 * the native scroll event.
 *
 * When the user has requested reduced motion, Lenis is intentionally not
 * initialized at all — the page falls back to plain native scrolling.
 * A CSS reset alone cannot stop Lenis's own rAF-driven scroll
 * interpolation, so this has to be an explicit JS-level check.
 *
 * Safe to call on every `astro:page-load` (View Transitions navigation) -
 * it tears down any previous instance first.
 */
export function initSmoothScroll() {
  destroySmoothScroll();

  if (prefersReducedMotion()) {
    return null;
  }

  lenis = new Lenis({
    autoRaf: false,
  });

  lenis.on("scroll", ScrollTrigger.update);

  tick = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  return lenis;
}

export function destroySmoothScroll() {
  if (tick) {
    gsap.ticker.remove(tick);
    tick = null;
  }
  lenis?.destroy();
  lenis = null;
}

export { gsap, ScrollTrigger };
