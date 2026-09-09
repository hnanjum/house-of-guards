import { prefersReducedMotion } from "./smoothScroll";

/**
 * `StandardsCarousel.astro`'s scroll/arrow/keyboard behaviour and its
 * active-card highlight. Deliberately NOT GSAP-driven, unlike every
 * other motion module on this site — the interaction itself is native
 * CSS scroll-snap plus the browser's own scroll physics (so touch swipe
 * "just works" for free, no gesture library needed), and this module
 * only reads/reacts to that native scroll position rather than owning
 * a tween of its own. `prefersReducedMotion()` (shared with every other
 * module, `smoothScroll.ts`) is still checked once, for the ONE thing
 * that genuinely IS motion here: whether an arrow click's programmatic
 * scroll animates or jumps instantly.
 *
 * TRACK — `[data-standards-track]`, a plain `overflow-x-auto` flex row
 * with `snap-x snap-mandatory` and `snap-center` on every card (see the
 * component's own markup) — the same hidden-scrollbar technique
 * `SectorsGrid.astro`'s own mobile tab-scroll row already established
 * (a scoped `<style>` block in the component, not promoted to a shared
 * global.css utility here either — this is only the SECOND consumer of
 * that technique, still below the "promote it" bar that pattern's own
 * comment sets, flagged there rather than silently duplicated without
 * comment).
 *
 * ARROW SCROLL AMOUNT — measured, not guessed: `scrollByOneCard()` reads
 * the FIRST real card's own rendered `offsetWidth` plus the track's own
 * computed `gap` at click time, so one arrow click always advances by
 * exactly one card-width regardless of which responsive tier (1/2/3
 * visible) is currently active — no hardcoded per-breakpoint pixel
 * table to keep in sync with the component's own Tailwind width classes.
 *
 * ACTIVE/CENTRED CARD — `updateActiveCard()` finds whichever card's own
 * centre point sits closest to the track's current centre point (`track
 * .scrollLeft + track.clientWidth / 2`) and swaps a small, fixed class
 * pair onto it — the same "wholesale swap of two mutually-exclusive
 * class arrays via `classList`" pattern `sectorsGridTabs.ts`'s own
 * `setTabState()` already uses for its tab indicator, reused here for
 * the identical reason: a hover/active pseudo-class collision risk
 * doesn't apply to a scroll-position-driven state the way it did there,
 * but keeping "add the active set, remove the inactive set" as one
 * atomic operation avoids ever leaving a card with BOTH class sets
 * applied at once mid-transition. Run on every `scroll` event
 * (`requestAnimationFrame`-throttled, one flight at a time — a fast
 * swipe fires many scroll events per frame, and this avoids doing the
 * O(cards) closest-card scan more than once per paint) and once more on
 * `resize` (a breakpoint change alters how many cards are visible,
 * which can change which card ends up closest to centre even at the
 * same `scrollLeft`).
 *
 * ARROW DISABLED STATE — no infinite loop. `updateArrowState()` disables
 * Prev at `scrollLeft <= 1` and Next at `scrollLeft >= maxScroll - 1`
 * (a small epsilon each way for sub-pixel rounding, not an exact `=== 0`
 * check, which real browsers rarely hit precisely). Chosen deliberately
 * over looping, which the brief left open ("unless you think looping is
 * clearly better"): this is a "read through 8 short items" list, not a
 * rotating showcase — a Prev/Next pair that visibly runs out at either
 * end matches how a reader expects a finite list to behave, and avoids
 * the real disorientation risk of a sudden jump back to the start with
 * no visual cue that a wrap just happened. `disabled` (not just a
 * visual dim) also removes each button from the tab order at its own
 * end, which a purely cosmetic opacity change wouldn't.
 *
 * KEYBOARD — `[data-standards-track]` itself carries `tabindex="0"` and
 * a `keydown` listener for ArrowLeft/ArrowRight, calling the SAME
 * `scrollByOneCard()` the arrow buttons use (not the browser's own
 * default arrow-key scroll on a focused scrollable element, which moves
 * by a small fixed pixel amount, not a full card — `preventDefault()`
 * is called specifically to override that default and keep the
 * increment consistent with the visible arrow controls).
 */

const TRACK_SELECTOR = "[data-standards-track]";
const CARD_SELECTOR = "[data-standards-card]";
const PREV_SELECTOR = "[data-standards-prev]";
const NEXT_SELECTOR = "[data-standards-next]";

// Swapped wholesale, never partially applied — see this file's own
// top-of-file comment for why (mirrors sectorsGridTabs.ts's own
// ACTIVE/INACTIVE_CLASSES pattern).
const ACTIVE_CLASSES = ["border-amber", "shadow-lg", "shadow-amber/15", "bg-paper/5"];
const INACTIVE_CLASSES = ["border-paper/15", "bg-paper/3"];
const ALL_CARD_CLASSES = [...ACTIVE_CLASSES, ...INACTIVE_CLASSES];

function updateActiveCard(track: HTMLElement, cards: HTMLElement[]) {
  const trackCenter = track.scrollLeft + track.clientWidth / 2;

  let closest: HTMLElement | null = null;
  let closestDistance = Infinity;
  for (const card of cards) {
    const cardCenter = card.offsetLeft + card.offsetWidth / 2;
    const distance = Math.abs(cardCenter - trackCenter);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = card;
    }
  }

  cards.forEach((card) => {
    card.classList.remove(...ALL_CARD_CLASSES);
    card.classList.add(...(card === closest ? ACTIVE_CLASSES : INACTIVE_CLASSES));
  });
}

function updateArrowState(track: HTMLElement, prevButtons: HTMLButtonElement[], nextButtons: HTMLButtonElement[]) {
  const maxScroll = track.scrollWidth - track.clientWidth;
  const atStart = track.scrollLeft <= 1;
  const atEnd = track.scrollLeft >= maxScroll - 1;
  prevButtons.forEach((btn) => (btn.disabled = atStart));
  nextButtons.forEach((btn) => (btn.disabled = atEnd));
}

function scrollByOneCard(track: HTMLElement, firstCard: HTMLElement, direction: 1 | -1) {
  const gap = parseFloat(getComputedStyle(track).columnGap || "0") || 0;
  const amount = (firstCard.offsetWidth + gap) * direction;
  track.scrollBy({ left: amount, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export function initStandardsCarousel(root: ParentNode = document) {
  const track = root.querySelector<HTMLElement>(TRACK_SELECTOR);
  const cards = Array.from(root.querySelectorAll<HTMLElement>(CARD_SELECTOR));
  if (!track || !cards.length) return;

  const prevButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(PREV_SELECTOR));
  const nextButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(NEXT_SELECTOR));
  const firstCard = cards[0];

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateActiveCard(track, cards);
      updateArrowState(track, prevButtons, nextButtons);
      ticking = false;
    });
  };

  track.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  prevButtons.forEach((btn) => btn.addEventListener("click", () => scrollByOneCard(track, firstCard, -1)));
  nextButtons.forEach((btn) => btn.addEventListener("click", () => scrollByOneCard(track, firstCard, 1)));

  track.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    scrollByOneCard(track, firstCard, event.key === "ArrowLeft" ? -1 : 1);
  });

  // Initial state — same two functions the scroll/resize handlers call,
  // so page load and every later interaction agree on the same source
  // of truth rather than the initial markup guessing at it separately.
  updateActiveCard(track, cards);
  updateArrowState(track, prevButtons, nextButtons);
}
