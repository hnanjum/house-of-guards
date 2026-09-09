import { gsap, prefersReducedMotion } from "./smoothScroll";

/**
 * `SectorsGrid.astro`'s tab-switching behaviour. Deliberately NOT a React
 * island — this project scopes Framer Motion to exactly two islands
 * (`NavDrawer`, `ContactForm`) and this component doesn't need component
 * state/props/reactivity beyond plain class/attribute toggling, so a
 * vanilla script keeps that boundary intact. GSAP (already a dependency,
 * already wired for every other motion module on this site) handles the
 * one piece of real animation: the panel crossfade on tab change.
 *
 * ARIA/keyboard: WAI-ARIA APG "Tabs with Automatic Activation" — arrow-key
 * movement between tabs both moves focus AND selects/shows that tab's
 * panel (no separate Enter/Space "confirm" step), Home/End jump to the
 * first/last tab. Roving tabindex (`tabindex="0"` on the selected tab
 * only, `"-1"` on the rest) so Tab moves focus into and out of the
 * tablist as one stop, matching the standard pattern.
 *
 * PANEL SWAP MECHANISM — sequential fade-out-then-fade-in, not a true
 * simultaneous overlap crossfade. Deliberate: with `[hidden]` toggling
 * involved (needed so an inactive panel doesn't sit in the accessibility
 * tree or tab order), having both panels visible-and-laid-out at once
 * mid-transition would mean two full two-column panels stacked in the
 * same grid position simultaneously — a real layout-jump risk this
 * project's own standing convention explicitly warns about (compiled-CSS
 * inspection can't catch a layout bug like that; only a real render can,
 * and there's no local preview available to check one against here).
 * Fading the outgoing panel out FIRST, unhiding the incoming panel only
 * once the outgoing one is hidden, and fading the incoming panel in
 * avoids that risk entirely — never more than one panel occupies layout
 * space at any point in the sequence.
 *
 * Reduced motion: an instant swap, no GSAP tween at all — the same
 * degradation pattern `missionReveal.ts`/`servicesGridReveal.ts`/
 * `scrollReveal.ts` all already use. Any leftover inline opacity/y styles
 * from a PRIOR non-reduced-motion transition are explicitly cleared
 * (`clearProps`) before toggling `hidden`, so a runtime change to the
 * reduced-motion preference mid-session can't leave a panel stuck at a
 * partial opacity.
 */

const TABLIST_SELECTOR = "[data-sectors-tablist]";
const TAB_SELECTOR = "[data-sector-tab]";
const PANEL_SELECTOR = "[data-sector-panel]";

// Two indicator vocabularies, keyed off whether a tab carries a
// `data-fill` value (set from SectorsGrid.astro's own `sector.fill`,
// "" for the four plain/light tabs) — see that file's own INDICATOR
// doc comment for the full derivation of why coloured tabs need a
// different foreground hue (Paper, not Ink/Amber) to stay readable and
// WCAG-compliant on their own background. Every class ever applied by
// EITHER vocabulary is listed in its own removal array so switching a
// tab between light/coloured states (impossible today, since `fill`
// is fixed per sector — kept anyway as a correctness guard, not a
// live requirement) can never leave a stale class behind.
const LIGHT_ACTIVE_CLASSES = ["border-amber"];
const LIGHT_INACTIVE_CLASSES = ["border-transparent", "hover:border-ink/55"];
const FILL_ACTIVE_CLASSES = ["border-paper"];
const FILL_INACTIVE_CLASSES = ["border-transparent", "hover:border-paper/70"];
const ALL_INDICATOR_CLASSES = [
  ...LIGHT_ACTIVE_CLASSES,
  ...LIGHT_INACTIVE_CLASSES,
  ...FILL_ACTIVE_CLASSES,
  ...FILL_INACTIVE_CLASSES,
];

function setTabState(tab: HTMLElement, active: boolean) {
  tab.setAttribute("aria-selected", active ? "true" : "false");
  tab.tabIndex = active ? 0 : -1;

  const isFilled = Boolean(tab.dataset.fill);
  const activeClasses = isFilled ? FILL_ACTIVE_CLASSES : LIGHT_ACTIVE_CLASSES;
  const inactiveClasses = isFilled ? FILL_INACTIVE_CLASSES : LIGHT_INACTIVE_CLASSES;

  tab.classList.remove(...ALL_INDICATOR_CLASSES);
  tab.classList.add(...(active ? activeClasses : inactiveClasses));
}

function crossfadePanel(outgoing: HTMLElement, incoming: HTMLElement) {
  if (prefersReducedMotion()) {
    gsap.set([outgoing, incoming], { clearProps: "opacity,y" });
    outgoing.hidden = true;
    incoming.hidden = false;
    return;
  }

  gsap.to(outgoing, {
    opacity: 0,
    duration: 0.15,
    ease: "power1.out",
    onComplete: () => {
      outgoing.hidden = true;
      gsap.set(outgoing, { clearProps: "opacity" });

      incoming.hidden = false;
      gsap.fromTo(
        incoming,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" },
      );
    },
  });
}

function activateSector(root: ParentNode, slug: string) {
  const tabs = root.querySelectorAll<HTMLElement>(TAB_SELECTOR);
  const panels = root.querySelectorAll<HTMLElement>(PANEL_SELECTOR);

  const nextTab = root.querySelector<HTMLElement>(`${TAB_SELECTOR}[data-slug="${slug}"]`);
  const nextPanel = root.querySelector<HTMLElement>(`${PANEL_SELECTOR}[data-slug="${slug}"]`);
  if (!nextTab || !nextPanel) return;

  tabs.forEach((tab) => setTabState(tab, tab === nextTab));

  if (!nextPanel.hidden) return; // already the active panel

  const currentPanel = Array.from(panels).find((panel) => !panel.hidden && panel !== nextPanel);
  if (currentPanel) {
    crossfadePanel(currentPanel, nextPanel);
  } else {
    nextPanel.hidden = false;
  }
}

export function initSectorsGridTabs(root: ParentNode = document) {
  const tablist = root.querySelector<HTMLElement>(TABLIST_SELECTOR);
  const tabs = root.querySelectorAll<HTMLElement>(TAB_SELECTOR);
  if (!tablist || !tabs.length) return;

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const slug = tab.dataset.slug;
      if (slug) activateSector(root, slug);
    });
  });

  tablist.addEventListener("keydown", (event) => {
    const key = event.key;
    if (key !== "ArrowRight" && key !== "ArrowLeft" && key !== "Home" && key !== "End") return;
    event.preventDefault();

    const tabArray = Array.from(tabs);
    const currentIndex = tabArray.findIndex((tab) => tab.getAttribute("aria-selected") === "true");
    let nextIndex = currentIndex;

    if (key === "ArrowRight") nextIndex = (currentIndex + 1) % tabArray.length;
    else if (key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabArray.length) % tabArray.length;
    else if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = tabArray.length - 1;

    const nextTab = tabArray[nextIndex];
    const slug = nextTab.dataset.slug;
    if (!slug) return;

    activateSector(root, slug);
    nextTab.focus();
  });
}
