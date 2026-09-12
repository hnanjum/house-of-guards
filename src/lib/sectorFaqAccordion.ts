import { gsap, prefersReducedMotion } from "./smoothScroll";

/**
 * `src/pages/sectors/[slug].astro`'s FAQ accordion — a genuinely new
 * interaction shape for this site, closest in spirit to
 * `sectorsGridTabs.ts` (a click-driven state-change module, not a scroll
 * entrance) but animating height rather than opacity/position.
 *
 * MECHANISM — each row's open/closed state lives entirely in the trigger
 * button's own `aria-expanded` attribute; there's no separate JS-tracked
 * "open" class. The panel's `overflow-hidden` + a GSAP height tween (0 ↔
 * its real `scrollHeight`, settling to `height:auto` once open so the
 * content can still reflow — e.g. a resize — without the tween's captured
 * height going stale) is standard practice for animating an intrinsically
 * auto-sized block. The chevron rotation and the open row's accent
 * left-border are BOTH pure CSS, keyed directly off `aria-expanded` via
 * Tailwind's `group-has-[[aria-expanded="true"]]:` variant in the markup —
 * no second state to keep in sync with the JS here.
 *
 * Independent rows, not a single-open-at-a-time accordion — a visitor
 * reading a long FAQ list has no reason to have a previously-read answer
 * collapse out from under them just because they opened another one.
 *
 * Reduced motion: an instant `height: auto`/`height: 0` set, no tween —
 * the same degradation pattern every other GSAP module on this site uses.
 */

const ITEM_SELECTOR = "[data-faq-item]";
const TRIGGER_SELECTOR = "[data-faq-trigger]";
const PANEL_SELECTOR = "[data-faq-panel]";

export function initSectorFaqAccordion(root: ParentNode = document) {
  const items = root.querySelectorAll<HTMLElement>(ITEM_SELECTOR);

  items.forEach((item) => {
    const trigger = item.querySelector<HTMLButtonElement>(TRIGGER_SELECTOR);
    const panel = item.querySelector<HTMLElement>(PANEL_SELECTOR);
    if (!trigger || !panel) return;

    gsap.set(panel, { height: 0, overflow: "hidden" });

    trigger.addEventListener("click", () => {
      const isOpen = trigger.getAttribute("aria-expanded") === "true";
      const next = !isOpen;
      trigger.setAttribute("aria-expanded", String(next));

      if (prefersReducedMotion()) {
        gsap.set(panel, { height: next ? "auto" : 0 });
        return;
      }

      if (next) {
        gsap.to(panel, {
          height: panel.scrollHeight,
          duration: 0.35,
          ease: "power2.out",
          onComplete: () => gsap.set(panel, { height: "auto" }),
        });
      } else {
        gsap.set(panel, { height: panel.scrollHeight });
        gsap.to(panel, { height: 0, duration: 0.3, ease: "power2.out" });
      }
    });
  });
}
