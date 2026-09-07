import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;
let tick: ((time: number) => void) | null = null;

/**
 * Initializes Lenis smooth scrolling and wires it into GSAP's ticker so
 * ScrollTrigger stays in sync with Lenis's own scroll position instead of
 * the native scroll event.
 *
 * Safe to call on every `astro:page-load` (View Transitions navigation) -
 * it tears down any previous instance first.
 */
export function initSmoothScroll() {
  destroySmoothScroll();

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
