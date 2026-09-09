import { gsap, ScrollTrigger, prefersReducedMotion } from "./smoothScroll";

/**
 * `MissionBand.astro`'s own scroll-triggered entrance — TWO independent
 * effects, on TWO independent triggers (image, text), deliberately NOT
 * `scrollReveal.ts`'s plain fade/rise or `servicesGridReveal.ts`'s
 * scale+tilt. Per the brief's own "should feel distinct from Hero's and
 * StatStrip's existing motion, not a copy of either" — a genuinely
 * different MECHANISM (clip-path, not opacity/transform) accomplishes
 * that more reliably than just picking different numbers for the same
 * fade+rise shape every other section already uses.
 *
 * IMAGE — a pure clip-path "unveil," no opacity change at all (the one
 * thing that makes this genuinely distinct from every other entrance on
 * the site, all of which are opacity-driven): `inset(0% 0% 100% 0%)`
 * (0% clipped from the top, 100% clipped from the bottom — i.e. nothing
 * visible, since the clipped regions consume the entire box) animates to
 * `inset(0% 0% 0% 0%)` (fully revealed). Because the TOP inset stays 0
 * throughout while only the BOTTOM inset shrinks, the visible region
 * always grows downward from the image's own top edge — reads as a
 * shutter/curtain descending to reveal the photo, a vertical top-to-
 * bottom unveil, not a slide. (A horizontal left-to-right wipe was the
 * other option the brief named; vertical was chosen since it reads more
 * like a deliberate "unveiling" and less like a generic carousel/slider
 * transition — a left-right wipe is the more obvious retrofit if this
 * ever needs revisiting.) GSAP tweens `clip-path` natively for two
 * `inset()` strings with the same parameter shape — no extra plugin
 * needed, confirmed against the installed gsap@3.15 in package.json.
 *
 * TEXT — every `[data-mission-reveal]` element (in DOM/reading order:
 * caption label, headline, underline rule, the two body paragraphs
 * together as one shared beat, button — see `MissionBand.astro`'s own
 * comment for why the two paragraphs share one beat rather than each
 * getting its own) fades+rises on ONE shared GSAP `stagger`, the same
 * mechanism `heroMuster.ts` already uses for its own 3-element cascade.
 * Safe here for the identical reason it's safe there: every reveal
 * element crosses this section's own single scroll threshold at
 * effectively the same scroll position, so one shared trigger + GSAP's
 * own `stagger` option is correct — UNLIKE `servicesGridReveal.ts`,
 * which needs a hand-rolled per-element delay specifically because it
 * has six INDEPENDENT per-card triggers with no single shared trigger
 * to stagger relative to.
 *
 * Both triggers key off the same threshold (`"top 80%"`) so the image
 * and text begin animating together, then diverge — the image's own
 * unveil (slower, ~1.1s, a genuine "moment") and the text's cascade
 * (five quick ~0.55s beats, ~0.12s apart) land at roughly the same time
 * without being frame-locked to each other.
 *
 * `power3.out` throughout (image) / `power2.out` (text, matching
 * `heroMuster.ts`'s own text-cascade easing exactly, since this is the
 * same "several small elements arriving in sequence" shape that module
 * already solved) — no bounce/elastic/back easing anywhere, matching
 * this project's sitewide motion rule.
 *
 * Reduced motion: the image is set straight to `inset(0% 0% 0% 0%)`
 * (fully revealed, no clip, no animation) and every text element is set
 * straight to `opacity:1`/`y:0` — no ScrollTrigger registered for
 * either — the same instant-final-state fallback shape every other
 * entry point on this site already uses. Untouched by the REPLAY change
 * below.
 *
 * REPLAY — both triggers use `toggleActions: "play reverse play
 * reverse"` (were `"play none none none"`), same idiom as every other
 * scroll reveal on this site — see `scrollReveal.ts`'s own note for the
 * full derivation. Both the clip-path unveil and the staggered text
 * cascade reverse cleanly: GSAP tweens `clip-path` and staggered
 * `opacity`/`y` tweens both natively support playing backward from
 * whatever progress they're currently at, so a quick scroll-past-then-
 * back re-triggers the SAME unveil/cascade, not a jump-cut or a replay
 * from a stale mid-animation state.
 */
const IMAGE_SELECTOR = "[data-mission-image]";
const TEXT_SELECTOR = "[data-mission-reveal]";

export function initMissionReveal(root: ParentNode = document) {
  const image = root.querySelector<HTMLElement>(IMAGE_SELECTOR);
  const text = root.querySelectorAll<HTMLElement>(TEXT_SELECTOR);

  if (!image && !text.length) return;

  if (prefersReducedMotion()) {
    if (image) gsap.set(image, { clipPath: "inset(0% 0% 0% 0%)" });
    if (text.length) gsap.set(text, { opacity: 1, y: 0 });
    return;
  }

  if (image) {
    gsap.set(image, { clipPath: "inset(0% 0% 100% 0%)" });
    gsap.to(image, {
      clipPath: "inset(0% 0% 0% 0%)",
      duration: 1.1,
      ease: "power3.out",
      scrollTrigger: {
        trigger: image,
        start: "top 80%",
        toggleActions: "play reverse play reverse",
      },
    });
  }

  if (text.length) {
    gsap.set(text, { opacity: 0, y: 20 });
    gsap.to(text, {
      opacity: 1,
      y: 0,
      duration: 0.55,
      stagger: 0.12,
      ease: "power2.out",
      scrollTrigger: {
        trigger: text[0],
        start: "top 80%",
        toggleActions: "play reverse play reverse",
      },
    });
  }
}

export { ScrollTrigger };
