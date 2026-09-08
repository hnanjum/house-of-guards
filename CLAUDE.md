# House of Guards

## What this is

Marketing website for **House of Guards**, a UK physical security company
based in Bradford, West Yorkshire, operating since 2023 (manned guarding,
close protection, CCTV monitoring, corporate security, construction site
security, overnight security — for corporate and high-net-worth clients
across retail, distribution, corporate, events, healthcare, and education
sectors).

Static Astro site (`output: 'static'`). Deployed to **Cloudflare Workers
using native static assets** — deliberately not Cloudflare Pages, per
Cloudflare's current recommendation for new static sites. See
`wrangler.jsonc` and the root `README.md` for the deploy/Workers Builds
setup.

Brand register: **discreet, disciplined, high-trust, understated
authority** — a private security consultancy or a bespoke law firm, not
a generic template. Existing tagline: "Security Built on Trust."

## Design system

**Colour** — defined once, in `src/styles/global.css`'s `@theme` block.
Tailwind's entire default colour palette is removed (`--color-*: initial`)
so nothing generic can leak in. Never hardcode a hex value or an
arbitrary bracket colour (`bg-[#0d0d0d]`) anywhere outside this file —
every component reaches for a named token class (`bg-ink`, `text-stone`,
`border-hairline`, etc.).

| Token | Hex | Role |
|---|---|---|
| `ink` | `#0D0D0D` | Near-black text, `secondary` button fill, icon strokes, the default focus ring |
| `paper` | `#FFFFFF` | The default background everywhere; also the text colour on every dark fill below |
| `guard-green-secondary` | `#366C00` | **The accent** — `primary` button fill, header info-bar background, header active-nav-link underline, stat strip background, ServicesIndex icon/open-state border, Hero/ClosingCta phone-link hover decoration. White/Paper text/icon on it: ~6.36:1 (AA, real margin). Ink on it: ~3.06:1 — fails AA normal-text outright, so every fill using this accent pairs it with white, the *opposite* of the two accents before it (both needed Ink). As a bare mark directly on Paper (underline/icon/border), this fill measures the same ~6.36:1 — genuinely compliant even at the 4.5:1 normal-text floor, not just the lenient 3:1 one; neither retired accent managed that. See `global.css`'s own token comment for the full write-up, including why the bare-mark number is provably the same as the fill number, not assumed to be |
| `guard-green-deep` | `#081F18` | An independent dark, near-black-green surface — the fallback wherever the current accent's own fill can't carry the text colour it needs (the mission-band pull-quote, `primary`/`secondary` button hover) |
| `stone` | `#6E6E6E` | Secondary text on Paper only (captions, meta, credential lines). ~4.6:1 on white — 14px and above only |
| `hairline` | `#E4E4E4` | Borders/rules/seams on Paper. Perfectly neutral (R=G=B) — never a warm greige |
| `footer-grey` | `#2A2A2A` | The footer's own dark neutral. Distinct from `ink` and both greens on purpose, so the footer reads as its own zone rather than a third green band or a slide into black |

All colour-on-background pairings above have been checked against WCAG
AA by actual relative-luminance calculation (not eyeballed) — white
text on `guard-green-deep`/`footer-grey` lands at 17–14:1 (AAA); white
on `guard-green-secondary` lands at ~6.36:1 (AA). If a new pairing is
ever introduced, verify it the same way before shipping it, don't
assume — this accent has already broken TWO assumptions that held for
its predecessors: (1) both retired accents (Guard Yellow, Guard Olive)
needed Ink text on their own fills; this one needs white, Ink actively
fails on it (~3.06:1). (2) both retired accents' default Ink focus
ring stayed comfortably safe on their own fill; on this one it doesn't
(~3.06:1, too thin to trust) — see the `.on-dark` note below. Don't
assume a pattern that worked for one accent colour carries over to the
next one — re-verify per colour, every time, including things that
"obviously" wouldn't change.

**Retired tokens, fully removed (not deprecated-in-place)**: `guard-green`
(`#0F3D2E`), `guard-olive` (`#8A9A2E`), `guard-olive-bright` (`#A7AF4A`),
`guard-yellow` (`#FFB606`) have all been replaced by later accents and
no longer exist as tokens — confirmed via a full repo grep before each
removal that nothing referenced the class names any more, so they were
deleted outright rather than left as deprecated-but-present. If any of
these names turn up in a future change request, they're gone — check
`git log` on `global.css` for what actually replaced them and when,
don't assume they're still defined somewhere.

**A real trap already hit once, and the fix it led to**: the original
default focus ring colour was the accent itself (then Guard Green) —
invisible against a same-coloured fill. The default `:focus-visible`
ring is now **Ink** instead — safe against Paper (~19.44:1) always,
and safe against most accent fills tried since (Guard Yellow ~11.06:1,
Guard Olive ~6.24:1), but **not** the current one: Ink on Guard Green
Secondary is only ~3.06:1, too thin to trust. `.on-dark` (swaps the
ring to white) is reserved for genuinely *dark* fills — currently the
Footer, StatStrip, and the header info bar (the last two carry it
specifically because of this accent's own math; neither did under the
two lighter accents that came before it). Check this per accent, not
by habit — a fill light enough to make `.on-dark` actively wrong
(Guard Yellow, white-on-it was ~1.76:1) can be swapped for one dark
enough to make it required, and the two prior accents both happened to
land on the "doesn't need it" side, which could easily read as a rule
rather than a coincidence if this note didn't call it out.

**Type** — two typefaces, both self-hosted via `@fontsource`/
`@fontsource-variable`, **never** the Google Fonts CDN:
- **Fraunces** (`@fontsource-variable/fraunces/full.css`, full axis range
  — wght/opsz/SOFT/WONK) — the display serif, dialled to low WONK /
  standard optical size throughout (quiet and weighted, not the font's
  own default "wonky" personality). Used only via the composed type-scale
  utilities below.
- **Montserrat** (`@fontsource-variable/montserrat`, wght axis only — no
  italic anywhere on the body font) — the body/UI sans, replacing
  Schibsted Grotesk. One token, `--font-sans` in global.css's `@theme`
  block: every `text-body*`/`text-caption`/`text-micro` composed
  utility (and `body`'s own base font-family) reads from it, so this
  was a single-point-of-truth swap — no component hardcodes a font
  name directly.

Eight composed type-scale utilities live in `global.css` as `@utility`
rules (`text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body-lg`,
`text-body`, `text-caption`, `text-micro`), plus `text-wordmark` for the
site name only. Each one bundles font-family + size + line-height +
weight in a single class — never assemble a heading from a raw Tailwind
size utility (`text-2xl`) or an arbitrary value (`text-[17px]`); if a new
size is genuinely needed, add it as a ninth named step here, don't
improvise one inline.

## Hard rules — do not violate these regardless of what a future prompt asks, unless the user explicitly overrides one

These came out of an explicit reaction against a previous, more
generic-looking version of this site. Treat them as load-bearing, not
stylistic preference:

- **No cream/off-white backgrounds** (nothing near `#F5F1E8`), **no
  gold/amber fill colours**, **no blue**, **no purple/terracotta**. The
  background is pure white; the only accent hues in the system are the
  two greens above and the one dedicated footer grey.
- **No tracked-out ALL-CAPS eyebrow labels above headings** ("WHAT WE
  DO", "OUR MISSION"). The one sanctioned exception to letter-tracking
  anywhere on the site is the site wordmark itself (`text-wordmark`) —
  a persistent identity mark, structurally different from a label
  repeated above every section. `SectionHeading.astro` has no eyebrow
  slot at all, by design — don't add one.
- **No repeated identical icon/badge across multiple items.** The six
  service icons (`src/icons/services/*.astro`) each have a genuinely
  different overall silhouette (a doorframe+figure, a stepped tower, a
  figure pair+arc, a camera+cone, a barrier+hatching, a crescent+dashed
  route) — never a single shield/badge shape with a different glyph
  swapped into the middle. Any new icon must clear the same bar.
- **No arrows appended to link/button text** ("All services →"). The
  `Button` primitive never renders one; affordance comes from
  weight/colour/border only.
- **No identical bordered/shadowed card grids with no real hierarchy.**
  There is no card-grid component in this codebase and none should be
  added for services/sectors-shaped content — see `ServicesIndex.astro`
  (a numbered, expandable list) and `SectorsStrip.astro` (an edge-to-edge
  photo strip with hairline seams) for the two sanctioned alternative
  treatments already built.
- **Left-aligned by default.** Centered alignment exists in exactly two
  sanctioned places sitewide: a pull-quote-style moment (`MissionBand`)
  and the closing CTA leading into the footer (`ClosingCta`).
  (`StatStrip` briefly carried a third, explicitly-instructed exception
  for one redesign pass — reverted back to left-aligned in a later
  pass along with the rest of that section's content/treatment, so
  this is back to exactly two; don't resurrect that entry assuming it
  was dropped by mistake.) Don't
  center a routine heading or hero — `SectionHeading`'s `align` prop
  defaults to `"left"` for this reason.
- **No stock photography that isn't genuinely relevant to a UK security
  company.** Every photo currently in the codebase (the hero image, the
  six sector images) is an **unthemed Lorem Picsum placeholder** — fixed
  seeds so they're stable across reloads, but random stock content with
  no real connection to security/guarding. This is flagged in a code
  comment at every usage site. If a placeholder image is ever added,
  flag it the same way and ask before treating it as final — don't let
  a placeholder silently become permanent.

## Motion system

- **GSAP + ScrollTrigger + Lenis** (`src/lib/smoothScroll.ts`) are the
  primary tools for scroll-based and page-load animation — Lenis is
  wired into GSAP's own ticker so `ScrollTrigger` stays in sync with
  Lenis's scroll position rather than the native scroll event.
  `src/lib/heroMuster.ts` (the homepage hero's one orchestrated load-in
  sequence) and `src/lib/scrollReveal.ts` are the existing examples of
  this pattern.
- **Framer Motion is scoped to exactly two React islands** —
  `NavDrawer.tsx` and `ContactForm.tsx` — and only for their own local
  interactive transitions (drawer slide, status-message fade). Never use
  it for whole-page or scroll-driven animation; that stays GSAP's job.
  Don't add a third Framer Motion island without a real reason — the
  architecture is deliberately "React islands are rare," not "React
  islands are the default."
- **Astro View Transitions** (`<ClientRouter />` in `BaseLayout.astro`)
  handle page-to-page navigation.
- **`prefers-reduced-motion` must be respected everywhere.** The CSS
  reset in `global.css` handles anything driven by a plain CSS
  transition/animation. It cannot reach JS-driven motion, so every
  GSAP/Lenis entry point checks `prefersReducedMotion()`
  (`smoothScroll.ts`) explicitly, and `NavDrawer.tsx` uses Framer
  Motion's own `useReducedMotion()` hook. Follow the same pattern for
  any new animated component — don't assume the CSS reset alone covers
  it.

## Icon set

Six custom line icons exist, one per service, each with a genuinely
distinct silhouette (see the hard rule above) — `src/icons/services/`.
All share one stroke language: `viewBox="0 0 40 40"`, `stroke-width
="1.25"`, `stroke-linecap="square"`, `stroke-linejoin="miter"`,
`fill="none"`, `stroke="currentColor"` (colour is set by whatever
wraps them — Ink by default, Guard Green in an open service row).

Two functional icons for the footer — `src/icons/Phone.astro` and
`src/icons/Email.astro` — deliberately break that stroke language
(rounded caps on `Phone`) since they need to read instantly as universal
pictograms next to real contact details, not as bespoke brand marks.

**Placement rule, load-bearing**: the six service icons render **only
inside the expanded state of their own service row** (`ServicesIndex
.astro`, via the native `<details>`/`<summary>` disclosure — no icon is
visible on a collapsed row. Don't add an icon to the collapsed/default
row state; opening a row is what earns it.

## Architecture conventions

- **Design tokens live in `src/styles/global.css` only.** No component
  should ever hardcode a colour, font-size, or font-weight — see
  "Design system" above.
- **`Button.astro`** (`src/components/ui/`) has three variants:
  `primary` (Guard Green Secondary fill, white text — the sitewide
  default, plus a subtle diagonal shine-sweep on hover/focus, with a
  `motion-reduce` fallback to a plain brightness shift), `secondary`
  (Ink fill, white text — for a page with more than one action, where
  only one should read as primary), `outline-light` (white border/text,
  transparent fill — for a CTA sitting on a Guard Green Secondary /
  Guard Green Deep / Footer Grey background, where Ink or the accent's
  own colour as text would fail contrast). Sharp corners always
  (`rounded-none` is explicit, not an accident of unstyled defaults).
  Never add an arrow. **Every site that renders the primary CTA must
  stay in sync** — header, hero, closing CTA, and `NavDrawer.tsx`'s own
  hand-matched mobile CTA (a React island, so it can't literally import
  `Button.astro`) have drifted apart once already (see Recent history
  below) after a colour/style change landed in `Button.astro` but was
  never propagated to `NavDrawer.tsx`. Check `NavDrawer.tsx` by hand
  any time `Button.astro`'s `primary` variant changes.
- **`NavLink.astro`** and **`Divider.astro`** both have a `tone="paper"`
  variant for use on dark/bold backgrounds — `tone="ink"`/`tone
  ="hairline"` (the defaults) assume a Paper background and use Guard
  Green for hover/emphasis, which doesn't read against a dark surface.
  Use `tone="paper"` on anything sitting in the header, footer, or a
  bold-fill section.
- **`SectionHeading.astro`** is left-aligned by default, has no eyebrow
  slot (see hard rules), and takes an optional `description` slot for a
  plain sentence-case supporting line below the heading — a legitimate,
  different thing from a tracked-caps label above it.
- Homepage-specific sections live in `src/components/home/` (`Hero`,
  `StatStrip`, `MissionBand`, `SectorsStrip`, `ClosingCta`), assembled in
  `src/pages/index.astro`. Shared primitives live in
  `src/components/ui/`.

## Standing conventions

- **No local dev server for visual verification, deploy-only.** This
  superseded an earlier "don't commit unless asked" rule — the
  established workflow now is: make the change, verify with `astro
  check` (types) and a real `astro build` + direct inspection of the
  compiled `dist/` output (grep the built CSS/HTML/JS — never assume,
  always confirm the actual compiled classes/tokens are present and
  the retired ones are genuinely gone), then ship it through git.
  `astro dev --background` (`astro dev stop`/`status`/`logs`) still
  exists for local iteration if genuinely needed, but the user checks
  the *live deployed URL* themselves — don't rely on a screenshot or a
  local preview as the final check.
- **Git/deploy flow, every round**: new branch off `main` → `git add`
  the specific changed files (never `-A`/`.`) → commit with a detailed
  message (contrast numbers, what changed and why, verification
  performed) → push → `gh pr create` → `gh pr merge --merge
  --delete-branch` → poll the Cloudflare Workers Builds check-run via
  `gh api repos/hnanjum/house-of-guards/commits/<sha>/check-runs`
  until `status: completed` → confirm live via `curl` against
  `https://house-of-guards.onata-1230.workers.dev/`, cross-checking
  the served HTML and its linked compiled CSS byte-for-byte against
  the local build (the only expected difference between two separate
  build invocations is Astro's per-build random island-hydration
  `uid` attribute — anything else diverging is a real problem, not
  noise). See the root `README.md` for the underlying Workers Builds
  setup.
- **Every colour pairing gets real WCAG contrast math, shown not
  asserted, every time — never assume a finding from one colour
  carries over to a different one**, even a colour that looks like a
  close relative of one already checked (see the Guard Green Secondary
  token note above for a concrete case: the two accents before it both
  needed Ink text and both left the default focus ring safe; this one
  needs the opposite on both counts).

## Recent history

Kept here as a running log so a future session doesn't have to
reconstruct *why* the current state looks the way it does from `git
log` alone. Newest first; each PR number is on `origin/main`.

- **PR #5 — Guard Green Secondary promoted, Guard Yellow retired.**
  Yellow "didn't work out visually." Green Secondary (`#366C00`) had
  been sitting in `@theme` as a reserved, unapplied token since PR #4
  — promoted to the sole primary accent everywhere Yellow was (button
  fill sitewide including `NavDrawer.tsx`'s CTA, header info bar,
  active-nav underline, stat strip, ServicesIndex accent, Hero/
  ClosingCta phone-link hover). Contrast pairing **inverted** from
  Yellow's — white text now, not Ink (Ink fails at ~3.06:1 on this
  fill; the two accents before it both needed Ink and both fail
  outright with white). `.on-dark` added to StatStrip + the header
  info bar for the first time, because the default Ink focus ring is
  also too thin on this fill (~3.06:1) — neither prior accent needed
  that either. The bare-mark-on-Paper question (underline/icon/
  border) was checked as its own real pairing rather than assumed —
  turned out to be the same ~6.36:1 as the fill pairing (contrast is
  symmetric between the two colours compared), clearing the full
  4.5:1 floor, unlike Yellow (~1.76:1) or Olive (~3.11:1) before it.
- **PR #4 — Guard Yellow, replacing Guard Olive/Olive-Bright.**
  `#FFB606`, sampled from a reference image. Reverted the short-lived
  white/bold/20px button-text experiment from PR #3 back to Ink text
  at the original size/weight (that fix was specific to Olive's own
  contrast shortfall and didn't apply once the fill changed). Ink on
  Yellow: ~11.06:1 (AAA). White on Yellow, and Yellow as a bare mark
  on Paper: ~1.76:1 — fails even the lenient 3:1 non-text floor, a
  real flagged regression from Olive's own ~3.11:1 on the same
  question. Added `guard-green-secondary` (`#366C00`) as a second,
  *reserved* token in the same PR — defined and contrast-checked, but
  deliberately not applied anywhere yet (that happened in #5). Guard
  Olive/Olive-Bright removed outright from `@theme` once a repo-wide
  grep confirmed nothing still referenced them.
- **PR #3 — real bug fixes found via live/device testing, not
  assumption.** The phone icon (`Phone.astro`) was originally two
  circles and a curve and genuinely didn't read as a phone — replaced
  with Feather Icons' real "phone" handset path verbatim, checked via
  a `sharp`-rendered PNG at actual deployed size before shipping. The
  mobile info bar overflowed on a real device (truncated address text)
  despite font-metric math predicting a comfortable margin — root
  cause was flexbox's `min-width: auto` default blocking shrink; fixed
  with real overflow safety nets (`shrink-0` on the phone link,
  `min-w-0` + `truncate` on the address), not just smaller numbers.
  The primary button's text was bumped to white + bold + a larger size
  specifically so it would clear the WCAG AA *large-text* 3:1
  threshold (≥14pt bold) on Guard Olive, rather than staying at normal
  text size and needing the stricter 4.5:1 floor. **This button change
  was fully reverted in PR #4** (see above) — don't resurrect it as
  the "current" button treatment.
- **PR #2 — info bar colour, single-line mobile layout, header
  rhythm.** First real live-diagnosed fix rather than a guess: the
  header CTA looked like it was "floating in extra padding" — traced
  to an actual computed height/padding mismatch in the nav row, not a
  visual illusion, and fixed at the source. Info bar text colour was
  picked (Ink vs. Stone vs. Olive, on the then-current Guard Olive
  fill) by running the real contrast numbers for each candidate rather
  than eyeballing it.
- **PR #1 — Montserrat replaces Schibsted Grotesk**, self-hosted via
  `@fontsource-variable/montserrat`, wired through the single
  `--font-sans` token so nothing had to be touched component-by-
  component. Same PR tightened the Ink default-focus-ring rationale
  comment in `global.css` (the origin of the "focus ring must be
  re-verified per accent colour" discipline that's been followed for
  every accent swap since).
- **Initial build** — project scaffolding (Astro static + Tailwind v4
  token system + GSAP/Lenis + two Framer Motion React islands +
  Cloudflare Workers native-assets deploy), then the full homepage
  (two-bar white header + hamburger/`NavDrawer` on mobile, hero with
  its Muster load-in sequence, stat strip, services index, mission
  band, sectors strip, closing CTA, footer) against Guard Green
  (`#0F3D2E`, the very first accent, retired in the first colour swap
  that followed and not otherwise mentioned above).

## Current status

**Built**: project infrastructure (tokens, fonts, primitives, Wrangler/
Cloudflare config) and the full homepage (header, hero with its Muster
load-in animation, stat strip, services index, mission band, sectors
strip, closing CTA, footer).

**Not started**: the interior pages — About, Careers, Our Policies,
Gallery, Contact. All still need building.

**Going forward, design work on this project is reference-driven, not
brief-driven.** Expect to be handed actual screenshots/mockups and asked
to match them precisely, rather than working from an abstract written
description the way the homepage was built. Read a supplied screenshot
literally and precisely before writing any code against it.

## Documentation

Full Astro documentation: https://docs.astro.build

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
