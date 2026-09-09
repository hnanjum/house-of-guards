import { gsap, ScrollTrigger, prefersReducedMotion } from "./smoothScroll";

/**
 * `SectorsGrid.astro`'s scroll-triggered entrance — a genuinely FOURTH
 * shape of motion on this site, not a fourth instance of one of the
 * three that already exist (`scrollReveal.ts`'s plain fade-rise,
 * `servicesGridReveal.ts`'s scale+tilt, `missionReveal.ts`'s clip-path
 * unveil + stagger). The brief named only the first two as the bar to
 * clear; this is deliberately distinct from the THIRD one too
 * (ServicesGrid's own scale+tilt), per CLAUDE.md's own standing note
 * that no existing module is a "default" a new section should just
 * copy — every section's motion is its own decision.
 *
 * MECHANISM — "line-draw + horizontal cascade," fitting a genuinely
 * different kind of section (a tab bar, a real interactive list of
 * items — every other reveal on this site animates a static content
 * block):
 *   1. `[data-sectors-line]` (a dedicated 1px divider element, added
 *      specifically so this could animate independently of the tab
 *      row it sits under — see SectorsGrid.astro's own MOTION comment
 *      for why the tablist's own native bottom border couldn't be reused
 *      for this) grows left-to-right via `scaleX` (0 → 1,
 *      `transform-origin: left`, the `origin-left` Tailwind utility on
 *      the element itself) — GSAP tweens `scaleX` natively, same "no
 *      extra plugin needed" property this codebase's `missionReveal.ts`
 *      already established for `clip-path`.
 *   2. Each `[data-sector-tab]` fades+slides in on the X axis (x: -12
 *      → 0, opacity 0 → 1) — HORIZONTAL, not the vertical y-rise every
 *      other reveal module on this site uses, since these are
 *      horizontally-arranged list items, not a stacked content block.
 *      Staggered via GSAP's own `stagger` option on one shared tween
 *      (safe here — unlike `servicesGridReveal.ts`'s six INDEPENDENT
 *      per-card triggers, every tab crosses this section's one shared
 *      scroll threshold at the same moment, the same condition that
 *      already makes `heroMuster.ts`/`missionReveal.ts`'s own shared-
 *      stagger approach correct for them).
 *   3. The one initially-visible content panel (`[data-sector-panel]
 *      :not([hidden])` at call time — always exactly one, the default
 *      active sector) does a single, quick fade+scale (opacity 0 → 1,
 *      scale 0.97 → 1) — deliberately the simplest of the three beats,
 *      no clip-path, no tilt, since the panel's own image+text content
 *      already carries enough visual weight without a fourth competing
 *      sub-mechanism.
 * All three run as ONE GSAP timeline off ONE shared `ScrollTrigger`
 * (`top 80%`, matching `missionReveal.ts`'s own threshold — this
 * section, like Mission Band, sits well below the fold), positioned via
 * timeline offsets rather than three separate triggers: the line starts
 * at 0, the tab cascade starts essentially alongside it (a tiny `"-=0.4"`
 * overlap so they read as one connected sequence, not two abutting
 * ones), and the panel fade starts once the tab cascade has mostly
 * settled.
 *
 * PROGRESSIVE ENHANCEMENT — matching `missionReveal.ts`'s own established
 * pattern exactly: nothing in this component's static markup/CSS starts
 * hidden. The line renders at its natural `scaleX: 1` (fully drawn),
 * every tab at its natural opacity/position, and the default panel at
 * its natural opacity — a no-JS or slow-JS visitor sees the SAME final,
 * correct page a JS-enabled visitor eventually settles into. This
 * module only calls `gsap.set(...)` to move each target to its OWN
 * pre-animation state immediately before registering the tween/
 * `ScrollTrigger` — never baked into a CSS class, so there's no window
 * where a real user could see something incorrectly hidden if this
 * script fails to run at all.
 *
 * `power2.out` throughout (matching `missionReveal.ts`'s own TEXT
 * easing — this is a UI-chrome/list reveal, not the slower, heavier
 * `power3.out` reserved elsewhere for a single large "moment" image).
 *
 * Reduced motion: every target set straight to its final state (line
 * `scaleX: 1`, tabs `opacity: 1, x: 0`, panel `opacity: 1, scale: 1`),
 * no `ScrollTrigger` registered at all — the same instant-final-state
 * fallback shape every other entry point on this site already uses.
 *
 * NICE-TO-HAVE, same module: a one-time auto-nudge on the mobile
 * horizontal-scroll tablist (`[data-sectors-tablist]`) — once, the
 * first time it scrolls into view, it scrolls itself a few px to the
 * right and eases back, a small motion cue that the row is scrollable
 * (on top of the static edge-fade `mask-image` already on the element
 * itself — see SectorsGrid.astro's own MOBILE TAB SCROLL comment).
 * Only runs when the tablist is ACTUALLY overflowing (`scrollWidth >
 * clientWidth` — i.e. only below `sm:`, where `flex-nowrap` can
 * overflow at all; at `sm:`+ this condition is always false since the
 * row's own wrapping, non-scrolling layout there never overflows), only once per page
 * load (a module-level flag, not a DOM attribute — nothing else needs
 * to observe whether this already fired), and fully skipped under
 * reduced motion (a scroll nudge is motion, not a static reveal, so it
 * doesn't get its own separate no-op fallback the way the three reveal
 * beats above do — it simply never runs).
 */

const LINE_SELECTOR = "[data-sectors-line]";
const TAB_SELECTOR = "[data-sector-tab]";
const PANEL_SELECTOR = "[data-sector-panel]";
const TABLIST_SELECTOR = "[data-sectors-tablist]";

let hasNudged = false;

function maybeNudgeTablist(tablist: HTMLElement) {
  if (hasNudged || prefersReducedMotion()) return;
  if (tablist.scrollWidth <= tablist.clientWidth) return; // not actually scrollable

  hasNudged = true;
  gsap.fromTo(
    tablist,
    { scrollLeft: 0 },
    { scrollLeft: 28, duration: 0.4, ease: "power2.out", yoyo: true, repeat: 1 },
  );
}

export function initSectorsGridReveal(root: ParentNode = document) {
  const line = root.querySelector<HTMLElement>(LINE_SELECTOR);
  const tabs = root.querySelectorAll<HTMLElement>(TAB_SELECTOR);
  const panel = root.querySelector<HTMLElement>(`${PANEL_SELECTOR}:not([hidden])`);
  const tablist = root.querySelector<HTMLElement>(TABLIST_SELECTOR);

  if (!line && !tabs.length && !panel) return;

  if (prefersReducedMotion()) {
    if (line) gsap.set(line, { scaleX: 1 });
    if (tabs.length) gsap.set(tabs, { opacity: 1, x: 0 });
    if (panel) gsap.set(panel, { opacity: 1, scale: 1 });
    return;
  }

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: line ?? tablist ?? panel!,
      start: "top 80%",
      toggleActions: "play none none none",
      onEnter: () => {
        if (tablist) maybeNudgeTablist(tablist);
      },
    },
  });

  if (line) {
    gsap.set(line, { scaleX: 0 });
    tl.to(line, { scaleX: 1, duration: 0.6, ease: "power2.out" }, 0);
  }

  if (tabs.length) {
    gsap.set(tabs, { opacity: 0, x: -12 });
    tl.to(tabs, { opacity: 1, x: 0, duration: 0.4, stagger: 0.08, ease: "power2.out" }, 0.1);
  }

  if (panel) {
    gsap.set(panel, { opacity: 0, scale: 0.97 });
    tl.to(panel, { opacity: 1, scale: 1, duration: 0.5, ease: "power2.out" }, 0.35);
  }
}

export { ScrollTrigger };
