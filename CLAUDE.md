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
  and the closing CTA leading into the footer (`ClosingCta`). Don't
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
  `primary` (Guard Green fill, white text — the sitewide default),
  `secondary` (Ink fill, white text — for a page with more than one
  action, where only one should read as primary), `outline-light`
  (white border/text, transparent fill — for a CTA sitting on a Guard
  Green / Guard Green Deep / Footer Grey background, where Ink or Guard
  Green text would fail contrast). Sharp corners always (`rounded-none`
  is explicit, not an accident of unstyled defaults). Never add an arrow.
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

- **Don't `git commit` unless explicitly asked to**, even after a
  significant chunk of work is done and verified. Leave changes staged/
  unstaged and say so.
- Local dev: `astro dev --background`, managed with `astro dev stop` /
  `astro dev status` / `astro dev logs` (see also the root `README.md`
  for the Cloudflare Workers Builds deploy flow).

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
