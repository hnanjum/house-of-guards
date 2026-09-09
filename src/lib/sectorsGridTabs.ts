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
 *
 * SELECTED-TAB SCROLL — `ensureTabVisible()`, called from `activateSector`
 * on every activation (click OR keyboard), not just once on first
 * scroll-into-view the way `sectorsGridReveal.ts`'s own one-time nudge
 * is. Purpose is different too: the nudge is a discoverability CUE that
 * the row scrolls at all; this scrolls the newly-SELECTED tab fully
 * clear of the edge-fade `mask-image` (see SectorsGrid.astro's own
 * MOBILE TAB SCROLL comment) so the fade can never sit on top of the
 * tab a visitor just chose — most likely to matter for the first
 * (Retail) and last (Education) tabs, which sit right against the
 * fade's own edges when the row is scrolled all the way to either end.
 * Guarded on `scrollWidth > clientWidth` (a no-op at `sm:`+, where the
 * row wraps instead of scrolling and nothing needs moving), and on
 * `prefersReducedMotion()` for `behavior` only (`"auto"`, not
 * `"smooth"`) — never SKIPPED under reduced motion, since an instant
 * jump to keep the active tab visible is a correctness fix, not a
 * decorative animation, unlike the nudge.
 */

const TABLIST_SELECTOR = "[data-sectors-tablist]";
const TAB_SELECTOR = "[data-sector-tab]";
const PANEL_SELECTOR = "[data-sector-panel]";

const ACTIVE_CLASSES = ["border-amber"];
const INACTIVE_CLASSES = ["border-transparent", "hover:border-ink/55"];
const ALL_INDICATOR_CLASSES = [...ACTIVE_CLASSES, ...INACTIVE_CLASSES];

function setTabState(tab: HTMLElement, active: boolean) {
  tab.setAttribute("aria-selected", active ? "true" : "false");
  tab.tabIndex = active ? 0 : -1;

  tab.classList.remove(...ALL_INDICATOR_CLASSES);
  tab.classList.add(...(active ? ACTIVE_CLASSES : INACTIVE_CLASSES));
}

function ensureTabVisible(tab: HTMLElement, tablist: HTMLElement | null) {
  if (!tablist || tablist.scrollWidth <= tablist.clientWidth) return;
  tab.scrollIntoView({
    inline: "center",
    block: "nearest",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
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
  const tablist = root.querySelector<HTMLElement>(TABLIST_SELECTOR);
  const tabs = root.querySelectorAll<HTMLElement>(TAB_SELECTOR);
  const panels = root.querySelectorAll<HTMLElement>(PANEL_SELECTOR);

  const nextTab = root.querySelector<HTMLElement>(`${TAB_SELECTOR}[data-slug="${slug}"]`);
  const nextPanel = root.querySelector<HTMLElement>(`${PANEL_SELECTOR}[data-slug="${slug}"]`);
  if (!nextTab || !nextPanel) return;

  tabs.forEach((tab) => setTabState(tab, tab === nextTab));
  ensureTabVisible(nextTab, tablist);

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
