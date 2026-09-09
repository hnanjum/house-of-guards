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

## Open issue — check this first

**Cloudflare Workers Builds appears stuck/delayed for this repo as of
PR #14's merge (`771fa592e95f7cd8c8b1e5542e868b8a384d86f0`).** All
three GitHub App check-suites on that commit (`vercel`,
`cloudflare-workers-and-pages`, `claude`) sat at `status: "queued"`
with zero check-runs across two separate checks, ~20 minutes apart —
not slow-but-progressing, genuinely stuck at zero both times.
Confirmed via direct `curl` against the live site (not just GitHub's
own status) that the deployed page still served PR #13's markup
(`sm:block` present) well after the merge — so this wasn't a GitHub UI
lag, the build genuinely never ran. All three unrelated apps stalling
simultaneously points at a GitHub webhook-dispatch problem for that
push, not something wrong with the code or with Cloudflare's build
queue specifically. **Per the user's own direction, PR #15 (mobile
StatStrip dividers + the Tailwind `@source` fix below) was pushed but
deliberately NOT auto-merged** — left open for the user to merge
themselves given the deploy uncertainty. **If a future session finds
more PRs piling up unmerged/undeployed**: check
`gh api repos/hnanjum/house-of-guards/commits/<sha>/check-runs` for the
latest merge commit first; if it's now completing normally, resume the
usual merge → poll → curl-verify flow. If still stuck at zero
check-runs, don't keep silently re-polling — say so plainly and point
the user at the Cloudflare dashboard (Workers & Pages →
house-of-guards → Deployments), which isn't something this session can
see into.

## Design system

**Colour** — defined once, in `src/styles/global.css`'s `@theme` block.
Tailwind's entire default colour palette is removed (`--color-*: initial`)
so nothing generic can leak in. Never hardcode a hex value or an
arbitrary bracket colour (`bg-[#0d0d0d]`) anywhere outside this file —
every component reaches for a named token class (`bg-ink`, `text-stone`,
`border-hairline`, etc.).

**SCOPE OF THE CURRENT PALETTE — read this before touching any colour
class anywhere on this site.** This project now runs TWO colour systems
side by side, split by SECTION, not by preference — the boundary has
moved twice (the original four-section rebrand, then MissionBand's own
redesign pulling it out of the Guard Green side too) and is genuinely
down to ONE section on the old palette now, not the original four-vs-
two split. Don't assume the older "four rebranded, two still Guard
Green" framing still describes the current boundary:
- **Header, Hero, StatStrip, `ServicesGrid.astro`, and now
  `MissionBand.astro`** all use the new palette (Electric Blue, Magenta,
  Amber, Cyan-Blue — MissionBand specifically uses Amber only, for its
  underline rule and button, plus plain Paper/Ink for everything else
  including its own caption, corrected there from an initial Amber
  contrast failure — see the colour table's own Amber row and the
  PR #20 history entry for the full story; it doesn't touch Electric
  Blue or Magenta at all). Guard Green Secondary and Guard
  Green Deep are RETIRED from all five of these — neither appears in
  any of their real rendered markup, confirmed via a full repo grep
  before each PR describing itself as done.
- **`ClosingCta.astro`** is now the ONLY section still using a Guard
  Green token — Guard Green Secondary, for its phone-link hover
  decoration, unchanged, pending its own separate future redesign. This
  is the one remaining reason `--color-guard-green-secondary` stays
  defined in `global.css`.
- **`Button.astro`'s `secondary` variant** (Ink fill, hover to Guard
  Green Deep) is the ONLY remaining reference to Guard Green Deep
  anywhere in the codebase, now that MissionBand no longer uses it —
  and it's a DORMANT one: this variant has zero real call sites
  anywhere on the site, so nothing actually renders this colour today.
  This is the one remaining reason `--color-guard-green-deep` stays
  defined — the class name is still real, literal text in
  `Button.astro`'s own source, which is all Tailwind's scanner needs to
  keep generating it; deleting the theme token would silently break
  that dormant variant's compiled CSS the moment it's ever activated,
  even though nothing on the live site would visibly change today.
  Don't delete either Guard Green token while these two real
  references still exist, and don't "finish the job" on `ClosingCta`
  without a real instruction to redesign it.

| Token | Hex | Role |
|---|---|---|
| `ink` | `#0D0D0D` | Near-black text, `secondary` button fill, icon strokes, the default focus ring, and — as of `StandardsCarousel.astro` — a full opaque SECTION background for the first time (every prior use was a translucent overlay or a small element, never a whole section; `on-dark` required here, an Ink-on-Ink focus ring is a literal 1:1 ratio) |
| `paper` | `#FFFFFF` | The default background everywhere; also the text colour on every dark fill below |
| `electric-blue` | `#2563EB` | **Primary block/background colour** (Header/Hero/StatStrip/ServicesGrid only) — Header's info-bar fill, StatStrip's fill, Hero's text-panel scrim (translucent, 85%), ServicesGrid's Manned Guarding/Overnight Security cards and Corporate Security's icon stroke. White/Paper on the opaque fill: ~5.17:1 (AA). Ink on it: ~3.76:1 — clears the 3:1 non-text floor but fails 4.5:1, so text/icons stay white. As an icon-stroke mark on a light card: ~5.17:1 vs Paper, ~4.74:1 vs Surface Alt — both clear 3:1 with real margin. See `global.css`'s own token comment for the full derivation, including Hero's own two-step translucent-panel composite (~4.53:1, a genuine but thin pass, flagged in that file) |
| `magenta` | `#A5195C` | **Secondary block/background colour** (ServicesGrid only) — Close Protection's card fill, CCTV Monitoring's and Construction Site Security's icon stroke. White on the fill: ~7.26:1 (AAA, the strongest fill pairing in this rebrand). Ink on it: ~2.68:1 — fails even the lenient 3:1 floor outright, so this fill never carries Ink. As an icon-stroke mark on a light card: ~7.26:1 vs Paper, ~6.66:1 vs Surface Alt |
| `amber` | `#F59E0B` | **The sole button/CTA colour, sitewide, no exceptions** — `Button.astro`'s `primary` variant, `NavDrawer.tsx`'s hand-matched CTA, `MissionBand.astro`'s "More about us" button (the same unmodified `primary` variant, not a one-off), and (as a bare non-text mark ONLY) the header nav's active-link underline, MissionBand's own underline rule, and — as of `StandardsCarousel.astro` — the active/centred card's own thin border+shadow. Ink on this fill: ~9.05:1 (AAA) — buttons therefore use INK text, a genuine reversal from Guard Green Secondary's own white-text pairing. White on it: ~2.15:1, fails even 3:1. **Bare-mark contrast on PAPER (the nav underline, MissionBand's own underline rule) is ~2.15:1, below the 3:1 WCAG 1.4.11 floor — flagged in PR #17, reviewed by the user against this exact number, and explicitly KEPT AS-IS as an accepted tradeoff for that USE (a decorative mark). This is a settled decision for bare marks on Paper, not an open item — don't "fix" it without a fresh, explicit ask.** Bare-mark contrast on the NEW `bg-ink` fill (`StandardsCarousel.astro`'s active-card border) is a different, much stronger pairing — ~9.05:1, the same ratio as Ink-on-Amber above, re-derived fresh rather than assumed to share the Paper case's own thin ~2.15:1 (see global.css's own Amber token comment for both derivations side by side). **AMBER IS NEVER SAFE AS RUNNING TEXT COLOUR ON PAPER — this was tried once and reverted.** `MissionBand.astro`'s caption initially shipped with Amber text too (PR #20's own first commit), flagged at the time as a genuinely different, more severe case than the bare-mark precedent (text needs the 4.5:1 floor, not 3:1, and ~2.15:1 fails both) — confirmed on review to be a real contrast-failure BUG, not a style preference, and corrected outright to Ink (a follow-up commit on the same PR). Don't reach for Amber as a `text-*` foreground colour anywhere on this site; every safe use of this token is either a fill (with Ink text on top) or a bare non-text mark. See `NavLink.astro`'s, `MissionBand.astro`'s, and `StandardsCarousel.astro`'s own comments |
| `cyan-blue` | `#0EA5E9` | **Rare accent only — never a section/card background fill.** Not applied anywhere in Header/Hero/StatStrip/ServicesGrid as of this rebrand (no per-section spec called for it); defined and fully contrast-checked so it's ready the moment a hover state or icon detail needs it. White on this fill: ~2.77:1 — fails even 3:1, so white is never a safe foreground here, including as a bare mark on Paper (same number, symmetric). Ink on it: ~7.01:1 (AAA) — the only safe foreground for this token |
| `stone` | `#6E6E6E` | Secondary text on Paper only (captions, meta, credential lines). ~4.6:1 on white — 14px and above only |
| `hairline` | `#E4E4E4` | Borders/rules/seams on Paper. Perfectly neutral (R=G=B) — never a warm greige |
| `footer-grey` | `#2A2A2A` | The footer's own dark neutral. Distinct from `ink` and every accent tried on purpose, so the footer reads as its own zone rather than sliding into whatever the current accent happens to be |
| `surface-alt` | `#F5F5F5` | A light, neutral surface for a background that needs to read as visually distinct from Paper without becoming a bold accent band — ServicesGrid's light/non-filled cards (Corporate Security, CCTV Monitoring, Construction Site Security). Ink on it: ~17.8:1 (AAA) |
| `guard-green-secondary` | `#366C00` | **RETIRED from Header/Hero/StatStrip/ServicesGrid/MissionBand.** Still live, unchanged, for `ClosingCta.astro`'s own phone-link hover decoration — the ONLY remaining reference anywhere in the codebase. White/Paper on it: ~6.36:1 (AA). Ink on it: ~3.06:1 (fails 4.5:1) |
| `guard-green-deep` | `#081F18` | **RETIRED from every homepage section, including `MissionBand.astro`** (its own full-bleed fill until this pass — see PR #20). The ONLY remaining reference anywhere in the codebase is `Button.astro`'s dormant `secondary`-variant hover — a real class-string in that file's own source, but zero real call sites render it. Kept defined for that one dormant reference only, not deletable. White text on it: ~17.2:1 (AAA) |

All colour-on-background pairings above have been checked against WCAG
AA by actual relative-luminance calculation (not eyeballed). If a new
pairing is ever introduced, verify it the same way before shipping it,
don't assume — this rebrand's own two new block colours (Electric
Blue, Magenta) split their foreground requirement the SAME way Guard
Green Secondary did (both need white, Ink fails), but Amber flips back
to the Guard Yellow/Guard Olive pattern (Ink needed, white fails) —
neither pattern is a rule, both were re-derived per colour, not
inherited. Don't assume a pattern that worked for one accent colour
carries over to the next one — re-verify per colour, every time,
including things that "obviously" wouldn't change.

**Retired tokens, fully removed (not deprecated-in-place)**: `guard-green`
(`#0F3D2E`), `guard-olive` (`#8A9A2E`), `guard-olive-bright` (`#A7AF4A`),
`guard-yellow` (`#FFB606`), and, as of the Electric-Blue/Magenta/Amber
rebrand, `services-accent-yellow` (`#FFB606`, the scoped ServicesGrid-
only token PR #16 introduced) have all been replaced or fully removed
and no longer exist as tokens — confirmed via a full repo grep before
each removal that nothing referenced the class names any more, so they
were deleted outright rather than left as deprecated-but-present. If
any of these names turn up in a future change request, they're gone —
check `git log` on `global.css` for what actually replaced them and
when, don't assume they're still defined somewhere. `guard-green-secondary`
and `guard-green-deep` are the one exception to "retired tokens get
deleted" — see the SCOPE note above for why they're kept defined.

**A real trap already hit once, and the fix it led to**: the original
default focus ring colour was the accent itself (then Guard Green) —
invisible against a same-coloured fill. The default `:focus-visible`
ring is now **Ink** instead — safe against Paper (~19.44:1) always,
and safe against most accent fills tried since (Guard Yellow ~11.06:1,
Guard Olive ~6.24:1, and — this rebrand's own re-confirmation — Amber
~9.05:1), but not every one: Ink on Guard Green Secondary was only
~3.06:1 (too thin to trust, retired from these sections anyway now),
and Ink on the new Electric Blue is ~3.76:1 (clears 3:1 but thin).
`.on-dark` (swaps the ring to white) is reserved for genuinely *dark*
fills — currently the Footer, Header's info bar, StatStrip, and
ServicesGrid's Electric-Blue/Magenta cards (defensively, since none has
a focusable element today). Amber does NOT carry `.on-dark` anywhere —
its own ~9.05:1 Ink ring is already comfortably safe, matching the
Guard Yellow/Olive pattern rather than Guard Green Secondary/Electric
Blue's. Check this per accent, not by habit — a fill light enough to
make `.on-dark` actively wrong (Guard Yellow, Amber) can sit right next
to one dark enough to require it (Electric Blue, Magenta) in the SAME
rebrand, which is exactly why this needs re-checking per colour rather
than assumed from whatever the previous accent needed.

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

Nine composed type-scale utilities live in `global.css` as `@utility`
rules (`text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body-lg`,
`text-body`, `text-caption`, `text-micro`, `text-fine`), plus
`text-wordmark` for the site name only. Each one bundles font-family +
size + line-height + weight in a single class — never assemble a
heading from a raw Tailwind size utility (`text-2xl`) or an arbitrary
value (`text-[17px]`); if a new size is genuinely needed, add it as a
named step here, don't improvise one inline. `text-fine` (weight 500)
is the most recent example of this rule actually being followed —
added specifically for `ServicesGrid.astro`'s card body copy when
`text-caption` (14px) needed to shrink further than the scale's
previous smallest step, `text-micro` (12px, deliberately scoped to
"legal/footer only"), could honestly cover; originally shipped at 10px
for that reason. **`text-fine` is now 12px too** — the project owner
changed it directly on `main`, outside any PR, confirmed deliberate not
a mistake — so `text-fine` and `text-micro` are currently IDENTICAL in
size, distinguished only by line-height (1.5 vs 1.4) and each one's own
documented scope (`text-fine` for multi-line body copy, `text-micro`
for short legal/footer fragments). This is flagged as a real, open
question in `text-fine`'s own `global.css` comment — whether to keep
both as deliberately-separate steps that happen to share a size right
now, or consolidate `ServicesGrid.astro` onto `text-micro` directly —
not resolved here or there; check that comment for the current state
before assuming either direction.

## Hard rules — do not violate these regardless of what a future prompt asks, unless the user explicitly overrides one

These came out of an explicit reaction against a previous, more
generic-looking version of this site. Treat them as load-bearing, not
stylistic preference:

- **No cream/off-white backgrounds** (nothing near `#F5F1E8`), **no
  purple/terracotta**. Originally this bullet also banned gold/amber
  fill colours and blue outright — **that half of the rule is now
  SUPERSEDED, by direct explicit instruction, for exactly four
  sections: Header, Hero, StatStrip, and `ServicesGrid.astro`.** Those
  four now run a real four-colour system (Electric Blue, Magenta,
  Amber, Cyan-Blue — see the colour table above) that includes both a
  blue and an amber as genuine, deliberate, sitewide-for-buttons fill
  colours. This is NOT the rule quietly eroding — it's a real,
  disclosed, dated boundary: the ORIGINAL rule's actual intent (no
  ungoverned colour sprawl, no component reaching for an arbitrary hex
  outside the token system) is still fully honoured, just satisfied a
  different way now — every new hue is a real, named, WCAG-checked
  token in `global.css`, not a bracket value or a one-off. **The rule
  STILL FULLY APPLIES, unchanged, everywhere else on the site** —
  `MissionBand.astro`, `ClosingCta.astro`, the Footer, and every future
  page/section — no blue, no gold/amber fill, no cream, no
  purple/terracotta, until a similarly explicit instruction extends the
  new palette there. **A SECOND, narrower exception was added on
  PR #23**: `SectorsGrid.astro` also draws on Electric Blue and Magenta,
  but only as a solid fill on FOUR of its six swapping CONTENT PANELS
  (as of PR #28's fixed tab-order sequence: Retail → Magenta,
  Distribution → Electric Blue, Corporate → plain, Events → Electric
  Blue, Healthcare → Magenta, Education → plain — up from PR #25's own
  Corporate/Events-only pairing; colour moved there from the tab bar
  itself, which PR #23 had originally coloured; see that component's own
  PANEL FILL comment) — every other part of this section (the tab bar,
  the two still-plain panels) stays on the plain Ink/Paper/Amber palette
  same as the rest of the un-rebranded site. Don't reach for Electric
  Blue/Magenta/Amber/Cyan-Blue outside the
  four named sections plus this one narrow SectorsGrid carve-out
  (Amber's own button/CTA use is the one further deliberate exception —
  see
  `Button.astro`'s own note — since a button/CTA can appear inside any
  section, including the still-Guard-Green ones, and it stays Amber
  regardless of which section it's rendered in) without a real decision
  extending this boundary, not an assumption that "the rebrand" now
  covers the whole site.
  ServicesGrid's own now-retired `--color-services-accent-yellow`
  token (`#FFB606`, the scoped one-component exception this bullet
  used to describe) has been fully removed from `global.css` — that
  specific exception no longer exists; ServicesGrid now draws from the
  same four-colour system as the rest of the rebranded sections, not a
  fifth scoped-only hue.
- **No tracked-out ALL-CAPS eyebrow labels above headings** ("WHAT WE
  DO", "OUR MISSION"). **`MissionBand.astro`'s own "Our mission" caption
  is now a REAL, SCOPED, EXPLICIT exception to this rule** — built on
  direct instruction naming that exact label, invoking the rule's own
  stated override clause ("unless the user explicitly overrides one").
  This is NOT the rule quietly eroding — it's ONE named section, not a
  reopened invitation to add eyebrow labels elsewhere; `SectionHeading
  .astro` still has no eyebrow slot at all, by design, and every other
  routine heading on the site still follows this rule unchanged. The
  one sanctioned exception to letter-tracking ITSELF (as opposed to
  this specific tracked-caps-eyebrow pattern) is still the site wordmark
  (`text-wordmark`) — a persistent identity mark, structurally different
  from either kind of label. Don't read MissionBand's own exception as
  licence to add a THIRD tracked-caps element anywhere without the same
  kind of direct, explicit instruction this one had.
- **No repeated identical icon/badge across multiple items, and the
  shield/checkmark motif is permanently banned outright** (not just
  "avoid overusing it" — don't use it at all, on anything). The six
  service icons (`src/icons/services/*.astro`) each have a genuinely
  different overall silhouette — currently a building facade, a figure
  inside an open protective arc, a wall camera, two offset footprints,
  a hard hat, and a crescent moon (rebuilt for `ServicesGrid.astro`;
  the earlier accordion-era silhouettes — a doorframe+figure, a stepped
  tower, a figure pair+shallow arc, a camera+view-cone, a barrier+
  hazard-ticks, a crescent+dashed patrol route — are gone, not kept
  anywhere) — never a single shield/badge shape with a different glyph
  swapped into the middle. Any new icon must clear the same bar.
- **No arrows appended to link/button text** ("All services →"). The
  `Button` primitive never renders one; affordance comes from
  weight/colour/border only. This is specifically about ornamenting a
  link/button's own COPY — it doesn't ban a directional icon used as a
  standalone, `aria-label`led navigation control with no text of its
  own to append to, e.g. `StandardsCarousel.astro`'s Prev/Next arrows
  (see that component's own comment for the fuller distinction) —
  flagged there so a future pass doesn't mistake genuine carousel
  pagination for a rule violation.
- **No identical bordered/shadowed card grids with no real hierarchy.**
  `ServicesIndex.astro` (the old numbered/expandable-list treatment
  this rule originally pointed at) has been deleted outright, replaced
  by `ServicesGrid.astro` — a genuine card grid, built on direct,
  explicit instruction (see that component's own top-of-file comment
  for the full reasoning on why this is a real, sanctioned exception
  rather than the rule being silently dropped, and for exactly why it
  doesn't even literally violate the rule's own "bordered/shadowed"
  wording — solid colour fills, no border, no shadow, real per-card
  hierarchy). There are now genuinely THREE sanctioned card-shaped
  treatments for services/sectors-shaped content, not the original
  two: `ServicesGrid.astro` (solid alternating-colour cards, no
  border/shadow — services). `SectorsStrip.astro`'s own edge-to-edge
  photo-strip treatment (the second variant this rule used to name) is
  now RETIRED — see PR #22 below — replaced by `SectorsGrid.astro`, a
  tabbed sector explainer that isn't a repeated card grid at all (one
  panel swaps per tab, not six cards shown together), so it sits
  entirely outside this rule's scope rather than being a third variant
  of it. `StandardsCarousel.astro` (PR #29) is the newest borderline
  case, flagged and reasoned through rather than assumed either way: its
  8 cards DO carry a real (if faint, `border-paper/15`) border, unlike
  `ServicesGrid.astro`'s borderless fills — but it's a horizontally-
  scrolling CAROUSEL, never showing all 8 cards laid out together the
  way a GRID (the rule's own literal target) does, and it carries real,
  DYNAMIC per-card hierarchy (the scroll-centred card gets a genuine
  `border-amber`+shadow highlight the other 7 never share at that
  moment) rather than the identical, static, no-hierarchy treatment the
  rule actually bans. Sits outside this rule's scope for the same
  reason `SectorsGrid.astro` does (not a grid at all), not a fourth
  exception TO the rule. Don't build a card-grid-shaped FOURTH
  treatment, and don't add a border/shadow to `ServicesGrid.astro`,
  without the same kind of explicit instruction PR #16 had.
- **Left-aligned by default.** Whole-SECTION centred alignment (heading
  AND content together) exists in exactly ONE sanctioned place sitewide:
  the closing CTA leading into the footer (`ClosingCta`). **This dropped
  from two to one on direct instruction** when `MissionBand` was rebuilt
  (PR #20) — its old centred pull-quote is gone, replaced by a genuine
  two-column image+text layout with the text column left-aligned,
  matching every other section's own default. Don't resurrect MissionBand
  as a centred exception assuming this was an oversight; it was a
  deliberate, called-out change, the same way `StatStrip`'s own brief
  third exception (introduced then reverted across two earlier passes)
  was deliberate both times. If a future session finds this rule
  described as "exactly two" anywhere else in this file (only in Recent
  History's own dated PR entries, which stay as accurate history rather
  than being rewritten), that's the state BEFORE PR #20, not the current
  one.

  **A genuinely NARROWER second exception exists as of PR #23's
  revision round on `SectorsGrid.astro`** — that section's `SectionHeading` alone
  (`align="center"`) is centred, while its own tab bar and content panel
  below stay left-aligned/their own natural alignment, per direct
  instruction. This is NOT the same shape as `ClosingCta`'s
  whole-section centring — checked against every other section before
  building it, and found there was no existing precedent for "heading
  centred, content below left" specifically (see `SectorsGrid.astro`'s
  own SECTION HEADING comment for the full account). `SectionHeading`'s
  `align` prop still defaults to `"left"` — nothing about the DEFAULT
  changed, only this one section now explicitly overrides it. Don't
  centre a routine heading elsewhere on this reasoning alone; this was a
  direct, specific instruction for this one section, not a reopened
  general licence.
- **No stock photography that isn't genuinely relevant to a UK security
  company.** STALE as written — updated to reflect current reality, not
  left describing a state that hasn't been true since PR #7 (hero) and
  this session's own PR #22 revision (sectors). Every real photo
  currently in the codebase (`hero-officer.png`, `mission-team.png`, and
  the six `src/assets/sectors/*.png` files) is now a REAL, final,
  House-of-Guards-branded asset — none are placeholders any more. The
  underlying RULE still holds (no generic/unthemed stock photography,
  ever) — it's the STATUS DESCRIPTION that had gone stale, not the rule
  itself. If a placeholder image is ever introduced again for a future
  section, flag it plainly in a code comment at its usage site and ask
  before treating it as final — don't let a placeholder silently become
  permanent, the same discipline that already governed every real photo
  now in the codebase before it was replaced.

## Motion system

- **GSAP + ScrollTrigger + Lenis** (`src/lib/smoothScroll.ts`) are the
  primary tools for scroll-based and page-load animation — Lenis is
  wired into GSAP's own ticker so `ScrollTrigger` stays in sync with
  Lenis's scroll position rather than the native scroll event. SEVEN
  small, section-scoped modules exist on top of it, each wired into
  `index.astro`'s own `astro:page-load` handler: `src/lib/heroMuster.ts`
  (the homepage hero's one orchestrated LOAD-triggered sequence — the
  one exception to "scroll-triggered," since the hero is already in
  view on load), `src/lib/scrollReveal.ts` (a plain generic fade/rise,
  `[data-reveal]`, used by StatStrip and, as of PR #29, also
  `StandardsCarousel.astro`'s eyebrow+heading block and its track — the
  first section since StatStrip to reuse this generic module directly
  rather than needing its own bespoke one, since a plain heading + a
  plain scrollable card list is exactly the shape it was already built
  for), `src/lib/servicesGridReveal.ts`
  (ServicesGrid's own scale+tilt entrance, `[data-services-reveal]`,
  one independent trigger PER card), `src/lib/missionReveal.ts`
  (MissionBand's own two-part entrance — a pure clip-path image unveil
  plus a five-beat staggered text cascade, `[data-mission-image]`/
  `[data-mission-reveal]` — see that module's own comment for why it
  needed a genuinely different MECHANISM, not just different numbers,
  to read as distinct from the other three), `src/lib/
  sectorsGridTabs.ts` (SectorsGrid's tab-switch panel crossfade — a
  genuinely different SHAPE of motion module from the others: it's
  not a scroll-triggered entrance at all, it's a click/keyboard-driven
  state-change animation, so it has no `ScrollTrigger`/`[data-reveal]`-
  style marker and isn't queried by `initScrollReveal()`; see PR #22
  below and that module's own comment for the full mechanism),
  `src/lib/sectorsGridReveal.ts` (SectorsGrid's OWN scroll-triggered
  entrance, added in PR #23, NOT present in PR #22's own original build
  of that section — a genuinely fourth motion SHAPE distinct
  from all three scroll-entrance modules above it: a divider line-draw
  via `scaleX`, a horizontal (not the usual vertical) tab cascade, and
  one panel fade+scale, one shared trigger), and `src/lib/
  standardsCarousel.ts` (`StandardsCarousel.astro`'s own scroll/arrow/
  keyboard interaction and active-card highlight, PR #29 — a genuinely
  DIFFERENT kind of module from the other six: it isn't GSAP-driven at
  all, the interaction itself is native CSS scroll-snap plus the
  browser's own scroll physics, so this module only reads and reacts to
  the resulting scroll position rather than owning a tween of its own;
  `prefersReducedMotion()` is still checked once, for the one thing
  that genuinely is motion — whether an arrow click's programmatic
  scroll animates or jumps instantly). Each of these seven is a
  real, deliberate design decision about which shape of motion suits
  that specific section — don't assume any of them is the "default"
  pattern a future section should just copy; read the specific
  section's own brief first.
- **Every scroll-triggered reveal plays ONCE on downward entry and
  never resets — NOT "both directions."** `toggleActions: "play none
  none none"`, applied uniformly across all FIVE real `ScrollTrigger`
  instances on the site: `scrollReveal.ts` (StatStrip),
  `servicesGridReveal.ts` (ServicesGrid, one per card),
  `missionReveal.ts` (MissionBand, TWO triggers — image and text), and
  `sectorsGridReveal.ts` (SectorsGrid, one trigger owning a shared
  timeline covering all three of its own beats). **This corrects PR
  #26's own "REPLAYS on every re-entry, in both scroll directions"
  language** (that PR briefly shipped `"play reverse play reverse"`) —
  refined the same session by a follow-up PR, on direct feedback that
  scrolling back UP past an already-played section must never hide/
  reset it; only a fresh downward `onEnter` should ever animate
  anything. Two of the six motion modules are correctly UNCHANGED,
  not overlooked, by either PR: `heroMuster.ts` has no `ScrollTrigger`
  at all (it's load-triggered, the hero is already in view on load —
  nothing to trigger against a scroll position), and
  `sectorsGridTabs.ts`'s panel crossfade is click/keyboard-driven, not
  scroll-driven, so it was never a candidate for either change. This
  refinement's own `toggleActions` value is, worth stating plainly, the
  literal SAME STRING this project used before PR #26 ever touched
  it — functionally this is a full revert of PR #26's own behaviour
  change back to strict one-shot-per-page-load, not a new third
  behaviour, even though it landed as its own deliberate, documented
  decision rather than a plain `git revert`. Confirmed via a full repo
  grep for `toggleActions` before and after both PRs — exactly five
  real code occurrences exist, all consistent, nothing missed.

  **Traced end to end against the real `toggleActions` string, not
  just asserted to work**: scroll down past the trigger → `onEnter` →
  `play` → animates in. Scroll back UP past it → `onLeaveBack` → the
  action there is `none`, so the tween/timeline's progress is left
  completely untouched — the element stays exactly as it settled
  (visible, at its final state), it does NOT hide or reset. Scroll
  down again → `onEnter` fires again (ScrollTrigger's own boundary-
  crossing DETECTION is unconditional; only the ACTION taken at each
  position depends on `toggleActions`) → `play` is invoked again, but
  the tween/timeline is already at progress 1 with nothing left to
  animate forward through, so this is a genuine no-op — no visible
  second playthrough, the element simply remains in its already-played
  state. `onLeave` and `onEnterBack` are also both `none` — neither
  ever un-plays anything either, regardless of whether a visitor
  scrolls all the way to page-bottom and back (see the now-superseded
  paragraph this replaced, further down `git log` on this file, for
  the `end`-defaults-to-page-bottom derivation; it no longer
  materially matters here since every non-`onEnter` position is `none`
  regardless of when/whether it fires).

  **Rapid back-and-forth scrolling across a trigger boundary was
  checked, not assumed safe, same as for PR #26's own version**: with
  every non-`onEnter` action now `none`, there is nothing left FOR
  rapid scrolling to interrupt or race — the tween only ever runs
  forward, once, the first time `onEnter` fires with a fresh (not-yet-
  played) target; every later boundary crossing in either direction is
  inert. `servicesGridReveal.ts`'s own per-card `delay` (its column
  stagger offset) therefore now only ever matters on that one real
  playthrough — there's no second playthrough for it to "re-apply" on,
  correcting that module's own PR #26-era comment, which described the
  delay reapplying "on every replay."

  `prefers-reduced-motion` fallback behaviour is unaffected by either
  PR — every module's reduced-motion branch still sets a single static
  end-state with no `ScrollTrigger` registered at all, so a
  reduced-motion visitor never sees a scroll-position-driven toggle in
  any direction, exactly as before both changes.
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
distinct silhouette (see the hard rule above) — `src/icons/services/`,
rendered by `ServicesGrid.astro` (the accordion these were originally
built for, `ServicesIndex.astro`, is gone — see Recent history). Shared
stroke language across all six: `viewBox="0 0 40 40"`,
`stroke-linecap="square"`, `stroke-linejoin="miter"`, `fill="none"`,
`stroke="currentColor"` (colour is set by whatever wraps them — since
the Electric-Blue/Magenta rebrand this is a genuine THREE-way switch,
not two: `text-paper` on a filled (Electric Blue/Magenta) card, or an
explicit per-card accent class — `text-electric-blue`/`text-magenta` —
applied directly to the icon on a light card, where the surrounding
text stays plain `text-ink`; see `ServicesGrid.astro`'s own comment for
the full per-card mapping).

**`stroke-width` is now `"2"`, not this family's original `"1.25"`** —
bumped when these six were rebuilt for `ServicesGrid.astro`'s bolder,
larger on-card context (directly on a solid colour fill at `size-12`/
48px, not Ink/Green-on-Paper inside a compact `1.25`-weight accordion
row). `1.25` is no longer used anywhere in this icon family — if a
`1.25`-weight service icon is ever needed again (e.g. a smaller/
compact context), treat it as a genuinely new decision, not a reversion
to an old default that's still "really" the house standard; `2` is
what's actually shipped and correct today.

One icon in the six, `OvernightSecurity.astro`'s crescent, is solid-
filled (`fill="currentColor" stroke="none"` on its one `<path>`) rather
than stroke-only — a deliberate, checked exception (a stroke-only
render of a crescent SLIVER's own boundary shows both its inner and
outer edge as separate visible lines, not a clean silhouette; see that
icon's own comment for the full story, including a real transcription
bug caught and fixed before shipping). The other five stay pure stroke
outlines, `fill="none"` throughout, aside from a few small solid detail
dots each already carries (toe-cluster dots, a camera lens centre) —
the same small-fill-for-a-detail-that-doesn't-stroke-well exception
this icon family has used since before this rebuild.

Two functional icons for the footer — `src/icons/Phone.astro` and
`src/icons/Email.astro` — deliberately break that stroke language
(rounded caps on `Phone`, and they've never picked up the `2`-weight
bump above — still `1.25`) since they need to read instantly as
universal pictograms next to real contact details, not as bespoke
brand marks. A third functional icon, `src/icons/Chevron.astro` (PR
#29, `StandardsCarousel.astro`'s Prev/Next controls), joins the same
category for the same reason — a real, widely-deployed glyph (Feather
Icons' own "chevron-right," verbatim, mirrored via `class="rotate-180"`
for the left-pointing variant rather than a second path string) rather
than a bespoke brand mark, `viewBox="0 0 24 24"` with round caps/joins
like `Phone`/`Email`, though it does keep the `2`-weight stroke (a
plain directional pictogram at a small 20px size reads better a touch
heavier than Phone/Email's own 24px `1.25`).

**Placement rule, load-bearing, UPDATED from the old accordion-only
version of this rule**: the six service icons now render on EVERY card
in `ServicesGrid.astro`, always visible, never gated behind a hover/
expand/open state — the "only inside an open accordion row" rule that
used to live here was specific to `ServicesIndex.astro`'s own
`<details>`/`<summary>` disclosure mechanism, which no longer exists
anywhere in this codebase. Don't resurrect a hide-until-interacted-with
treatment for these icons without a real reason to.

## Architecture conventions

- **Design tokens live in `src/styles/global.css` only.** No component
  should ever hardcode a colour, font-size, or font-weight — see
  "Design system" above.
- **`Button.astro`** (`src/components/ui/`) has three variants:
  `primary` (**Amber fill, Ink text** — the sitewide default, rebranded
  off Guard Green Secondary's own white-text pairing, see the colour
  table above — plus a subtle diagonal shine-sweep on hover/focus, with
  a `motion-reduce` fallback to a plain brightness shift), `secondary`
  (Ink fill, white text, hover to Guard Green Deep — for a page with
  more than one action, where only one should read as primary; this
  variant has zero real call sites anywhere in the codebase and was
  deliberately NOT touched by the rebrand as a result — see
  `Button.astro`'s own comment), `outline-light` (white border/text,
  transparent fill — for a CTA sitting on a Guard Green Secondary /
  Guard Green Deep / Footer Grey background, where Ink or the accent's
  own colour as text would fail contrast; also unaffected by the
  rebrand — its border/text stay literal white regardless of which dark
  fill it sits on). Sharp corners always (`rounded-none` is explicit,
  not an accident of unstyled defaults). Never add an arrow. **Every
  site that renders the primary CTA must stay in sync** — header, hero,
  closing CTA, and `NavDrawer.tsx`'s own hand-matched mobile CTA (a
  React island, so it can't literally import `Button.astro`) have
  drifted apart once already (see Recent history below) after a
  colour/style change landed in `Button.astro` but was never propagated
  to `NavDrawer.tsx`. Check `NavDrawer.tsx` by hand any time
  `Button.astro`'s `primary` variant changes — done again for the Amber
  rebrand, both now share the same Amber fill/Ink text pairing.
- **`NavLink.astro`** and **`Divider.astro`** both have a `tone="paper"`
  variant for use on dark/bold backgrounds — `tone="ink"`/`tone
  ="hairline"` (the defaults) assume a Paper background and use Amber
  (rebranded off Guard Green Secondary) for hover/emphasis, which
  doesn't read against a dark surface. **`tone="ink"`'s Amber underline
  is below the 3:1 WCAG non-text floor** (~2.15:1 as a bare mark on
  Paper — see the colour table above) — a KNOWN, REVIEWED, ACCEPTED
  tradeoff (PR #17, user confirmed keeping it as shipped), not an open
  item to "fix" unprompted. Use `tone="paper"` on anything sitting in
  the header, footer, or a bold-fill section.
- **`SectionHeading.astro`** is left-aligned by default, has no eyebrow
  slot (see hard rules), and takes an optional `description` slot for a
  plain sentence-case supporting line below the heading — a legitimate,
  different thing from a tracked-caps label above it.
- Homepage-specific sections live in `src/components/home/` (`Hero`,
  `StatStrip`, `ServicesGrid`, `MissionBand`, `SectorsGrid`,
  `StandardsCarousel`, `ClosingCta`), assembled in `src/pages/index.astro`. Shared
  primitives live in `src/components/ui/`. (`ServicesGrid`'s own
  predecessor, `ServicesIndex.astro`, lived directly under
  `src/components/` instead — an inconsistency with this convention
  that's now moot, since it's deleted; if anything else is ever found
  sitting outside this structure, that's the convention to bring it
  back in line with, not a precedent to follow.)

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
  needs the opposite on both counts). The same discipline applies to
  SIZE changes too, not just colour swaps — WCAG's "large text"
  exemption (only needing 3:1, not 4.5:1) depends on the actual
  rendered size/weight; a heading that qualified at 28px can silently
  drop out of that exemption once reduced to 20px/normal-weight,
  switching it to the stricter floor. Re-derive which threshold
  applies after any size change, don't assume a previously-confirmed
  classification still holds (this happened for real on StatStrip's
  own label — still passed either way, but the margin genuinely
  shrank and needed re-checking, not re-asserting).
- **Compiled-CSS/HTML-artifact inspection (`grep`-ing the built
  `dist/` output) is NOT sufficient to catch real layout/rendering
  bugs — it only proves a class compiled to the right declaration, not
  that the declaration does anything once real ancestor context is
  involved.** Confirmed the hard way on StatStrip: `Divider.astro`'s
  vertical variant depends on `self-stretch` (`align-self:stretch`),
  which only has any effect when the element's IMMEDIATE parent is a
  flex or grid container — a wrapper using `display:block` (e.g.
  `hidden shrink-0 sm:block`) gives it nothing to stretch against, so
  the divider (empty, no explicit height) renders at 0px. Every PR
  that shipped this bug had `dist/index.html`/`dist/_astro/*.css`
  correctly showing the class present and compiling to the right
  colour/opacity rule — that was never the problem, and no amount of
  re-checking compiled text would have caught it. Only a real render
  did, once the user reported it. **Any wrapper around
  `<Divider orientation="vertical">` must be a real flex/grid
  container (`sm:flex`, never `sm:block`) for it to render at all.**
  More generally: for any change involving flex/grid child alignment,
  sizing, or stretching that depends on what the PARENT is (not just
  what class is on the element itself), do an actual rendered check
  before considering it verified — build a standalone static HTML
  harness from the real `astro build` output (real compiled section +
  real compiled CSS, no dev server involved), serve it via a throwaway
  scratch `node` `http` server on a random port (NOT `astro dev`/
  `astro preview` — this still respects the "no local dev server"
  rule above, since it never touches the project's own tooling), and
  view it through the available browser tooling — a screenshot AND a
  `getBoundingClientRect()`/computed-style measurement, not a glance.
  Tear the scratch server down and delete the harness file before
  committing either way.
- **Dead CSS can be generated from a doc COMMENT, not just from
  markup** — Tailwind's JIT scanner does plain-text matching across
  entire source files, comments included, not comment-aware parsing.
  A backtick-quoted, class-shaped string mentioned in a comment purely
  for historical/comparison reference (e.g. documenting an OLD value
  a component used to have) generates a genuine, permanent CSS rule if
  that exact class isn't used anywhere else in the codebase — hit
  three separate times across the Hero/StatStrip rebuilds (`sm:text-
  h1`, a stale `bg-guard-green-deep/18` mention, a stale `size-8`
  mention, a stale `sm:block` mention). **Standing check on this whole
  component family now**: before shipping any change to Hero,
  StatStrip, or their icon files, list every backtick-quoted token in
  the touched doc comments and cross-check each against real markup
  usage — reword to prose (break the contiguous class-shaped string
  apart) if the token is genuinely orphaned. A token that's still used
  ELSEWHERE in the codebase (even if not in the file being edited) is
  safe to mention as-is.
- **Custom line icons: rasterize and actually look before shipping the
  geometry, every time** — a `sharp`-based script rendering the SVG to
  PNG at the real deployed display size AND a magnified size,
  individually and composited into a row with its siblings. This
  caught two separate ambiguous/illegible icon drafts in this
  project's history (the original `Phone.astro` reading as "two
  connected dots," and an early StatStrip "24/7" icon — a clock face
  with two overlapping circles as an infinity motif — reading as a
  target or a face). Never assume a hand-drawn shape reads correctly
  from the path coordinates alone.
- **This project's named type scale is not monotonically weighted by
  size** (nine steps as of `text-fine`'s own addition — see the Design
  system section above; this bullet's own finding predates that step
  and still holds) — `text-caption` (14px) is weight 500, genuinely
  HEAVIER than `text-body-lg` (20px, weight 400), despite being
  smaller. Don't assume stepping two different elements down the scale
  independently preserves their relative boldness — check the actual
  bundled weight of each landing step, not just its size, when the
  weight relationship matters for visual hierarchy.

## Recent history

Kept here as a running log so a future session doesn't have to
reconstruct *why* the current state looks the way it does from `git
log` alone. Newest first; each PR number is on `origin/main` — WITH ONE
CURRENT EXCEPTION: **PR #29 is NOT YET MERGED as of this entry** (open,
awaiting review — per this project's own standing "open a PR, don't
merge it yourself" convention). Everything it describes lives only on
its own branch until the user merges it; don't assume its code is live
on `main` just because it's documented here. **PR #29's entry sits
ABOVE PR #28's below even though #28's own code landed on `main`
first** — both were opened from the same session as two genuinely
independent changes (per explicit instruction to treat them that way),
#28 merged quickly while #29 was still being verified, and this file's
own newest-first ordering tracks each PR's OWN recency, not merge
order — don't read the position below as implying #29 predates #28.
(PR #28 was originally flagged here, alongside #29, as "both open, not
yet merged" — now confirmed merged; the user merged it directly and
asked for this branch to be rebased onto the resulting `main` and this
exact CLAUDE.md conflict resolved keeping BOTH PRs' own additions
rather than either overwriting the other, which is what produced the
current shape of this whole section. PR #27, flagged as unmerged-as-
of-its-own-entry in an earlier revision of this paragraph, is also
confirmed merged — checked live via `gh pr list` fresh at the start of
that session, not assumed from this file's own text. This "the
previous entry's own unmerged-flag has gone stale" pattern keeps
recurring across sessions — PR #23/#24/#25/#26 all hit it too, further
down this log; check `gh pr list` fresh every time rather than trusting
this paragraph's own PR number.)

- **PR #29 — "Standards We Refuse to Drop": a NEW homepage carousel
  section, not a conversion of an existing one, despite the original
  brief describing it as converting "the current static 8-item, 2-row
  grid into a carousel." Checked before writing any code, not assumed:
  a full `git grep` across every local AND remote branch, the entire
  commit history (`git log --all --oneline | grep -i standard`), and
  every existing homepage component found zero trace of this section
  anywhere in the repository — there was never an intermediate static
  grid. Surfaced this to the user directly via two rounds of
  clarification (the first answer's own real content was accidentally
  an unfilled template placeholder — `[paste all 8 headline + body pairs
  from your screenshot]`, no screenshot ever having been attached to the
  conversation — caught and flagged rather than silently fabricated
  into 8 invented marketing claims for a real company) before the real
  eyebrow/heading/background and all 8 real headline+body pairs were
  supplied. Built directly in its final carousel form, per the user's
  own explicit confirmation ("you're right, build it fresh, not a
  conversion").

  **New files**: `src/components/home/StandardsCarousel.astro` (markup +
  content data + a long top-of-file comment walking through every
  design decision — colour derivations, the "does the active-card
  border read as a CTA" check the brief explicitly asked for, the
  "preserve existing entrance motion" instruction that didn't apply
  since none existed to preserve, and the deliberate choice not to loop
  the carousel — not condensed further here, read that file's own
  comment for the full account), `src/lib/standardsCarousel.ts` (the
  scroll/arrow/keyboard interaction + active-card-highlight logic, NOT
  GSAP-driven unlike every other motion module on this site — native
  CSS scroll-snap plus the browser's own scroll physics, so touch swipe
  works with zero gesture-library code), `src/icons/Chevron.astro` (a
  third functional icon alongside Phone/Email, Feather Icons' real
  "chevron-right" glyph verbatim, mirrored via `rotate-180` for the
  left-pointing variant).

  **Section background** — `on-dark bg-ink`, a genuinely NEW use of Ink
  (every prior use was a translucent overlay or a small UI element,
  never a full opaque section fill before this) — contrast re-derived
  fresh for this role rather than assumed: white/Paper text on Ink
  ≈19.44:1, `text-paper/70` secondary text ≈9.6:1 (computed
  independently, not assumed to carry over from Footer's own use of the
  identical class on a DIFFERENT, lighter dark fill). `.on-dark` is
  required (an Ink focus ring on an Ink background is a literal 1:1
  ratio, the most extreme version of the exact problem it exists to
  solve) — both `global.css`'s `:focus-visible`/`.on-dark` comment and
  its Amber token comment updated in this same change to record this as
  a new case, not silently left implicit.

  **Active-card highlight** — thin `border-amber` (2px) + `shadow-lg
  shadow-amber/15` + a slightly brighter `bg-paper/5` wash, on whichever
  card the scroll position currently centres. Deliberately NOT a solid
  Electric-Blue/Magenta fill (both reserved for ServicesGrid/SectorsGrid's
  own panel fills) and NOT Amber as a FILL (reserved for `Button.astro`).
  This is a genuine THIRD instance of Amber's already-established "bare,
  non-text mark" use (alongside the header nav underline and MissionBand's
  own underline rule) — re-derived fresh rather than assumed to share
  either's number, since both existing cases check Amber against PAPER;
  this checks it against the new Ink fill: ≈9.05:1, clearing the 3:1
  floor with the widest margin of any bare-mark Amber use on the site (no
  thin-margin tradeoff to accept the way the Paper case needed one).
  Explicitly checked against "does this read as a button/CTA" before
  shipping, per the brief's own ask: every real Amber use on this site is
  either a solid fill or a bare underline beneath clickable nav text —
  this is neither (a border/ring around a non-interactive, non-clickable
  card, no fill change, no cursor change) — the closest real precedent is
  `SectorsGrid.astro`'s own `border-amber` active-tab underline, an
  already-understood "currently selected" signal, not "click this."

  **"No identical bordered/shadowed card grids" and "no arrows appended
  to link/button text" hard rules** — both checked against this section
  explicitly, both updated in this same commit with the reasoning for why
  it doesn't trip either: the cards DO carry a real (if faint,
  `border-paper/15` ≈1.50:1, genuinely decorative/exempt from any WCAG
  floor) border, unlike `ServicesGrid.astro`'s borderless fills, but this
  is a CAROUSEL — never showing all 8 cards laid out together the way a
  GRID does — with real, dynamic per-card hierarchy (the active state),
  not the identical/no-hierarchy treatment the rule actually targets. The
  Prev/Next arrows are standalone, `aria-label`led navigation controls
  with no text of their own, not a decorative glyph ornamenting a link's
  copy — a different thing from what that rule bans.

  **Layout** — native CSS scroll-snap (`snap-x snap-mandatory`, each card
  `snap-center`), card width (not item count) driving visible count:
  `w-full` (mobile, one card, no peek — the below-row Prev/Next buttons
  already signal "there's more," unlike `SectorsGrid.astro`'s own tab row,
  which needed an edge-fade `mask-image` for the same reason since it had
  no other affordance) → `sm:w-[calc((100%-1.5rem)/2)]` (two visible) →
  `lg:w-[calc((100%-3rem)/3)]` (three visible, the brief's own explicit
  ask), every width an exact `calc()` against the track's real `gap-6` so
  N cards + (N-1) gaps always fill the row exactly. ONE real Prev/Next
  button pair, not four — a `display:contents` wrapper trick promotes the
  same two buttons from "a centred flex row below the track" (mobile) to
  "absolutely positioned, half outside the track's own left/right edge,
  vertically centred against the row" (`md:`+), so there's only ever one
  `disabled`-state and one `aria-label` per direction to keep in sync,
  not two.

  **No infinite loop** — disabled/greyed Prev at the start and Next at
  the end, the brief's own default; the reasoning for choosing that over
  looping (a finite "read through 8 items" list, not a rotating showcase)
  is recorded in `standardsCarousel.ts`'s own comment.

  **Motion** — zero new bespoke module. `[data-reveal]` on the
  eyebrow+heading block and the track, reusing the SAME sitewide generic
  `scrollReveal.ts` StatStrip already uses (already wired into
  `index.astro`'s no-argument `initScrollReveal()` call, so this needed
  no new script wiring at all) — the first section since StatStrip to
  reuse it directly rather than needing something bespoke the way
  `SectorsGrid`/`MissionBand`/`ServicesGrid` each did (each of THOSE
  needed a genuinely different mechanism because of what its own layout
  demanded — a tab bar, a clip-path unveil, six independent per-card
  triggers — not because of an arbitrary "every section needs its own
  motion" expectation). The brief's own "preserve existing entrance
  motion... adjust it only if genuinely required" instruction assumed a
  pre-existing motion module to preserve; flagged plainly that none
  existed, rather than inventing a bespoke one just to satisfy language
  that didn't actually apply to a genuinely new section.

  **A real, self-caught mistake during the dead-CSS-from-doc-comments
  audit this project's own standing convention requires**: an early draft
  of this component's own LAYOUT comment quoted the bare token `` `p-4` ``
  in prose (paraphrasing `global.css`'s own "still used directly — p-4,
  gap-6, etc" line) — `p-4` isn't used as real markup anywhere in this
  component, and confirmed via direct `dist/` inspection that it WAS
  compiling to a genuine orphaned `.p-4{...}` rule before the fix (reworded
  to prose) and confirmed gone after — the same failure class this
  project's own standing convention already warns about, caught in the
  act rather than assumed safe. (`global.css`'s OWN identical "p-4,
  gap-6, etc" phrase does NOT independently regenerate this rule — `.css`
  files aren't part of Tailwind's scanned content set, confirmed by
  rebuilding with the fix in place and `.p-4` genuinely absent even
  though `global.css`'s own line is untouched — so this was entirely a
  self-inflicted risk in the new file, not a pre-existing bug elsewhere
  needing its own fix.) A second, related instance was also caught and
  fixed the same pass: a bare, unprefixed `` `translate-x-1/2` ``
  mention in the ARROWS paragraph, when every real occurrence in this
  file's own markup is `md:`-prefixed — reworded to keep the prefix in
  both backtick spans.

  `astro check`: 0 errors (41 files, same 2 pre-existing `ContactForm
  .tsx` hints). A clean `astro build` + direct `dist/index.html`/`.css`
  inspection confirmed: all 8 real cards present with the real supplied
  copy, correct DOM order (SectorsGrid → StandardsCarousel → ClosingCta
  → Footer), the `md:contents` arrow-wrapper structure and both
  `aria-label`s present, both `calc()` width expressions compiled, and —
  the specific classes this component relies on being JS-toggled at
  runtime, not just present in static markup — `border-amber`,
  `shadow-amber/15` (confirmed a real `color-mix()` rule, not a silent
  no-op), `bg-paper/5`, `bg-paper/3`, `border-paper/15` all genuinely
  compiled, checked directly rather than assumed from the source class
  string alone.

- **PR #28 — `SectorsGrid.astro`'s content-panel fill sequence reassigned
  from PR #25's own Corporate/Events-only pairing to a fixed FOUR-of-six
  sequence, in tab order: Retail → Magenta, Distribution → Electric Blue,
  Corporate → plain (Surface Alt), Events → Electric Blue, Healthcare →
  Magenta, Education → plain (Surface Alt). Per direct instruction — a
  fixed positional sequence, not a per-sector thematic pick the way
  Corporate/Events' own original colours were reasoned about (Magenta for
  Close Protection's "premium/discreet" register, Electric Blue for
  Manned Guarding's "visible presence" register). No new thematic
  justification was invented for Retail/Distribution/Healthcare's own
  colours — flagged plainly in `SectorsGrid.astro`'s own updated PANEL
  FILL comment rather than backfilled with a story that wasn't given.

  **Zero new colour math** — per explicit instruction, this reuses
  `PANEL_FILL_CLASS`'s existing `bg-electric-blue text-paper` /
  `bg-magenta text-paper` classes and the already-verified `.on-dark`
  EXCLUSION verbatim (deliberately excluded on every coloured panel,
  same as PR #25's own reasoning — each panel contains a real focusable
  `Button`, whose ring must stay the default Ink pairing, ~9.05:1 against
  Amber; `.on-dark` would silently force it to Paper, which fails
  outright against Amber at ~2.15:1). Only the `Sector[]` array's own
  `fill` property changed on four entries (added on Retail/Healthcare,
  removed from Corporate, left unchanged on Events/Education/
  Distribution — Distribution's `fill: "electric-blue"` is newly added,
  the other five were either already correct or already absent).

  **Default-tab-on-load check, done before calling this finished, not
  skipped** — `DEFAULT_SLUG` is Retail (`SECTORS[0].slug`), so this is
  the first time the INITIALLY-VISIBLE panel on page load carries a
  fill, not a plain background. Traced both motion modules that touch
  this panel before/after page load, not assumed safe: `sectorsGridTabs
  .ts`'s crossfade only ever tweens `opacity`/`y` and toggles `hidden` —
  it never reads or sets a background colour, and the panel's fill class
  is a static, server-rendered Tailwind class that exists in the markup
  before either module runs. `sectorsGridReveal.ts`'s own scroll entrance
  (the one-time fade+scale on `[data-sector-panel]:not([hidden])`, i.e.
  whichever panel is active on load) is the same story — `opacity: 0 → 1,
  scale: 0.97 → 1`, no colour read/write anywhere in the tween. A CSS
  `opacity` fade animates a filled background exactly the same way it
  animates a plain one; neither module's progressive-enhancement fallback
  (the no-JS/JS-fails static markup) depends on which colour is present
  either. **No issue found** — documented in `SectorsGrid.astro`'s own
  new DEFAULT-TAB-ON-LOAD CHECK comment so a future session doesn't have
  to re-derive this from scratch if the sequence is ever touched again.

  `astro check`: 0 errors. A clean `astro build` + direct `dist/`
  inspection confirmed, in the compiled output: Retail's and Healthcare's
  panels now carry `bg-magenta text-paper`, Distribution's and Events'
  carry `bg-electric-blue text-paper`, Corporate's and Education's carry
  `bg-surface-alt text-ink`, every "Learn more" button still identical
  (`bg-amber text-ink`) regardless of panel background, and — per this
  project's own standing dead-CSS-from-doc-comments discipline, run
  again on both touched files — no new orphaned Tailwind-class-shaped
  token was introduced by either file's own updated prose.

- **PR #27 — corrects PR #26's own `toggleActions` decision, from
  "replay in both directions" to "play once on downward entry, never
  reset while scrolling up." Same session, direct follow-up feedback:
  the bidirectional replay PR #26 shipped made scrolling back UP past
  an already-played section hide/reset it (via `onLeaveBack: reverse`)
  — explicitly the WRONG behaviour; an element should only ever animate
  in on a fresh downward entry, and must never disappear again once
  played, regardless of scroll direction.

  `toggleActions: "play reverse play reverse"` → `"play none none
  none"` on the same five real `ScrollTrigger` instances PR #26 touched
  — `scrollReveal.ts`, `servicesGridReveal.ts`, `missionReveal.ts`
  (both its triggers), `sectorsGridReveal.ts`. Worth stating plainly,
  not glossed over: this new value is the literal SAME STRING the
  project used before PR #26 ever touched it, so — functionally — this
  is a full revert of PR #26's own behaviour change back to strict
  one-shot-per-page-load, landed as its own deliberate, documented
  decision (with the reasoning for THIS choice recorded fresh, not just
  "see PR #26") rather than a plain `git revert`.

  Given the brief's own two named candidates (`"play none none none"`
  for strictly-once, `"play none none reverse"` if it should still
  reset when scrolled back up past the top so it can replay on the next
  down-scroll) — the strictly-once form was the one that actually
  matches the brief's own closing disambiguator ("elements should never
  disappear/reset while scrolling upward past them, only ever animate
  in on downward entry"): `"play none none reverse"` WOULD reset on
  `onLeaveBack` (scrolling up past `start`), which is precisely "an
  element disappearing while scrolling upward past it" — the thing
  explicitly ruled out. `"play none none none"` is the only one of the
  two that never resets in either direction, so it's the one that was
  used.

  **Traced end to end against the real string, not just asserted**:
  scroll down past the trigger → `onEnter` → `play` → animates in.
  Scroll back up past it → `onLeaveBack` → action `none` → the tween's
  progress is left completely untouched, so the element stays exactly
  as it settled (visible, at its final state) — it does not hide.
  Scroll down again → `onEnter` fires again (ScrollTrigger's own
  boundary-crossing detection always fires regardless of the configured
  action; only what happens in response depends on `toggleActions`) →
  `play` is invoked again, but the tween is already at progress 1 with
  nothing left to animate forward through, so this is a genuine no-op —
  no visible second playthrough, the element just stays in its
  already-played state.

  Same 5-real-occurrence grep-before-and-after discipline as PR #26's
  own entry (`astro check`: 0 errors; a full `astro build` + `dist/`
  inspection confirmed zero `"play reverse play reverse"` remaining in
  the compiled bundle and exactly 5 `"play none none none"`
  occurrences). `servicesGridReveal.ts`'s own PR #26-era comment
  claiming its per-card `delay` "re-applies on every replay" was
  corrected — there is no longer a second playthrough for it to
  re-apply on, since nothing ever resets a card once it's played.
  `prefers-reduced-motion` fallback is unaffected, same as PR #26's own
  entry already noted — untouched by either PR.

  See the Motion system section above for the corrected, current-state
  description — this entry is kept as an accurate record of what PR #27
  itself changed and why, not rewritten to just restate the Motion
  system section's own already-current text.

- **PR #26 — every scroll-triggered reveal on the site now REPLAYS on
  every re-entry, in both scroll directions, instead of playing once
  per page load and staying played. `toggleActions: "play none none
  none"` → `"play reverse play reverse"` on all FIVE real
  `ScrollTrigger` instances on the site — `scrollReveal.ts` (StatStrip),
  `servicesGridReveal.ts` (ServicesGrid, one per card), `missionReveal
  .ts` (MissionBand, both its image and text triggers), and
  `sectorsGridReveal.ts` (SectorsGrid, its one shared timeline covering
  all three of its own beats). Applied consistently across every one —
  no section left on the old one-shot behaviour. `heroMuster.ts`
  (load-triggered, no `ScrollTrigger` at all) and `sectorsGridTabs.ts`
  (click/keyboard-driven panel crossfade, also no `ScrollTrigger`) were
  correctly left untouched, not overlooked — neither was ever a
  scroll-triggered reveal to begin with. Confirmed via a full repo grep
  for `toggleActions` both before and after: exactly five real code
  occurrences existed, all five now updated, nothing missed.

  **A real GSAP default worth understanding, found by reading the
  installed `gsap` package's own `ScrollTrigger` source rather than
  assumed**: none of the five triggers sets an explicit `end` (or
  `endTrigger`). Per ScrollTrigger's own documented behaviour for that
  case, `end` resolves to the bottom of the WHOLE SCROLLABLE PAGE, not
  this element's own bottom edge — so for a section sitting mid-page
  (every one of these), the `onLeave`/`onEnterBack` positions in the
  toggle string are practically inert in ordinary browsing (a visitor
  would have to scroll to the literal bottom of the page while still
  past this element to ever fire them). The two positions doing the
  real work are `onEnter` (crossing `start` scrolling down → play) and
  `onLeaveBack` (crossing `start` scrolling back up → reverse) — which
  is exactly the "replay on re-entry, either direction" behaviour that
  was asked for, and neither depends on `end` at all. `reverse` was
  kept at the other two positions anyway, matching the standard idiom,
  rather than swapped for `none` there — harmless where they don't
  fire, and the correct behaviour on the rare occasion a visitor really
  does scroll to page-bottom mid-reveal. No `end`/`endTrigger` was
  added to any of the five — this stayed a pure `toggleActions` value
  change, not a rewrite of the trigger geometry, per explicit scope.

  **Rapid back-and-forth scrolling across a trigger boundary was
  checked, not assumed safe**: GSAP reverses an in-progress tween/
  timeline from its CURRENT progress rather than restarting from 0, so
  quick scrolling across a `start` line just makes the animation chase
  whichever direction is current — no jank, no restart-from-zero, no
  overshoot (`power2.out`/`power3.out` throughout every one of these
  five, no bounce/elastic anywhere on this site to begin with).
  `servicesGridReveal.ts`'s own per-card `delay` (its column stagger
  offset) re-applies on every fresh forward playthrough, including a
  replay — a deliberate, disclosed consequence, not a bug: it
  reproduces the exact same staggered arrival every time the grid
  re-enters view, not a degraded instant reappearance on the second and
  later passes.

  `prefers-reduced-motion` fallback behaviour is completely untouched —
  every module's reduced-motion branch still sets one static end-state
  with zero `ScrollTrigger` registered at all, so a reduced-motion
  visitor never sees a scroll-position-driven toggle in either
  direction, exactly as before this change.

  `astro check`: 0 errors. A full `astro build` + direct `dist/`
  inspection confirmed zero `"play none none none"` remaining anywhere
  in the compiled bundle and exactly 5 `"play reverse play reverse"`
  occurrences, matching every real `ScrollTrigger` on the site.

  **A separate, related investigation from the same request — Lenis
  smooth-scroll on touch devices — was reported back to the user, NOT
  changed, in this same session.** Confirmed via reading `smoothScroll
  .ts` and its one call site (`BaseLayout.astro`) directly, not
  assumed: Lenis IS initialized on every device including touch/mobile
  — the ONLY gate anywhere in this codebase is `prefersReducedMotion()`
  inside `initSmoothScroll()` itself, no separate touch-device check
  exists at either that function or its call site. What actually
  differs on touch is `syncTouch`, a Lenis constructor option this
  codebase never sets explicitly (`new Lenis({ autoRaf: false })` is
  the whole config) — confirmed via the installed `lenis` package's own
  source that this defaults to `false`, and that with it `false`, a
  touch-drag gesture is deliberately let through to the browser's own
  native scroll physics untouched (Lenis calls `event.preventDefault()`
  only when `syncTouch` is true for that event) while Lenis still
  passively listens to the resulting native `scroll` event to keep
  `ScrollTrigger` in sync. So this is NOT "Lenis is disabled on
  mobile" — every scroll reveal above, including the new replay
  behaviour, functions correctly on touch, since native scrolling still
  drives `ScrollTrigger` — it specifically means touch-drag gestures
  don't get Lenis's own eased/lerped momentum feel layered on top of
  native touch scrolling, only wheel/trackpad input does. This is the
  library's own out-of-the-box default, never explicitly configured
  either way by this codebase, and is standard, commonly-recommended
  practice (layering a virtual-scroll lerp on top of native touch
  physics usually feels laggier than the OS's own tuned momentum
  scrolling, not smoother). Reported to the user as a real, genuine
  UX tradeoff rather than a bug — no code changed here; a follow-up
  PR only lands if/once the user confirms they actually want
  `syncTouch: true` (or similar) forced on despite that tradeoff.

- **PR #25 — reverses PART of PR #23's `SectorsGrid.astro` tab
  treatment, on live review feedback that the tab-fill styling itself
  was wrong (not the underlying decision to give Corporate/Events
  their own accent colour, which stays). Four changes:
  1. **Tabs** — the whole Paper-based coloured-tab indicator PR #23
     built (a second, per-fill class vocabulary in
     `sectorsGridTabs.ts` — `FILL_ACTIVE_CLASSES`/
     `FILL_INACTIVE_CLASSES`/`isFilled`, plus a `data-fill` attribute
     on the tab `<button>` for it to key off) is deleted OUTRIGHT, not
     left dormant. Every tab, including Corporate and Events, is now
     visually identical — plain Ink text, the same
     transparent/Ink-55%-hover/Amber-active `border-b-2` every other
     tab (and `NavLink.astro`'s own underline) already uses.
  2. **Content panel** — the SAME two sectors PR #23 had coloured
     (Corporate → Magenta, Events → Electric Blue) now get a SOLID
     fill on their own swapping content panel instead, white text,
     reusing `ServicesGrid.astro`'s own already-verified fill/
     foreground pairing DIRECTLY (white ~7.26:1 on Magenta, ~5.17:1 on
     Electric Blue) rather than recomputing — same numbers, just moved
     to a different element. Deliberately NOT `.on-dark` on this fill,
     a real, necessary divergence from ServicesGrid's own version: this
     panel contains a genuine focusable `Button` ("Learn more"), and
     `.on-dark`'s `:focus-visible` descendant selector would have
     silently forced that button's ring to Paper — which fails outright
     against Amber (~2.15:1, below the 3:1 floor) — where the default
     Ink ring (~9.05:1) is already safe and is what `Button.astro`'s
     own comment documents it needing. ServicesGrid's own cards can
     afford `.on-dark` purely defensively because they have no
     focusable content at all; this panel genuinely can't. The other
     four sectors keep their unchanged plain Surface Alt/Ink panel.
     "Learn more" stays the unmodified Amber-fill/Ink-text `Button`
     primary variant on every panel regardless of background — sitewide
     convention, no exception here either.
  3. **Centering** — `justify-center-safe` (Tailwind v4.1+'s
     `justify-content: safe center`) on the tablist at every
     breakpoint, replacing PR #23's own uncentred
     `overflow-x-auto`/`sm:flex-wrap` row. Chosen specifically over
     plain `justify-center`: per the CSS Box Alignment spec, a bare
     `center` on an OVERFLOWING flex line can clip its own start
     content out of scroll range in some engines — `safe center` is
     the spec's own defined fallback, behaving like `flex-start`
     (scrollable from position 0) whenever the row genuinely overflows
     (below `sm:`) and like true centring whenever it doesn't (`sm:`+,
     where all six tabs already fit on one line) — the "centre when it
     fits, scroll normally when it doesn't" behaviour asked for, with
     zero JS/media-query branching needed.
  4. **Fade vs. active tab** — a real bug in PR #23's own mobile
     edge-fade `mask-image` (see that PR's own entry below): nothing
     stopped it sitting on top of the tab a visitor had just selected,
     most visible on the first (Retail) and last (Education) tabs,
     which sit right against the fade's own edges at rest. Fixed with a
     new `ensureTabVisible()` in `sectorsGridTabs.ts`, called from
     `activateSector` on EVERY activation (click or keyboard, not just
     once on load the way PR #23's own one-time discoverability nudge
     in `sectorsGridReveal.ts` is) — scrolls the newly-active tab fully
     clear of the fade whenever the row is actually scrollable
     (`scrollWidth > clientWidth`, a no-op at `sm:`+). Never skipped
     under reduced motion (only its `behavior` — `"auto"`, not
     `"smooth"` — changes), since keeping the active tab visible is a
     correctness fix, not a decorative animation.

  `astro check`: 0 errors. A full `astro build` + direct `dist/`
  inspection (not just `astro check`) confirmed, in the FINAL compiled
  output: all 6 tab buttons render with byte-identical classes except
  active/inactive state, zero `data-fill` anywhere in the built HTML,
  Corporate's panel carrying `bg-magenta text-paper` and Events'
  carrying `bg-electric-blue text-paper` with the other four unchanged
  at `bg-surface-alt text-ink`, every "Learn more" button identical
  (`bg-amber text-ink`) regardless of its panel's background,
  `justify-content:safe center` present, and `scrollIntoView`/the new
  `ensureTabVisible` logic present in the compiled tab-switch JS
  bundle. No dead-CSS audit was run beyond this — per explicit
  instruction, this was a small, well-scoped revert-plus-fix, not a
  repeat of PR #23's own broader sweep.

- **PR #23 — a revision round on `SectorsGrid.astro` (PR #22's own
  section), from live review feedback given in the SAME session PR #22
  shipped in — six changes, opened as a genuinely separate PR, not a
  same-branch follow-up commit on PR #22. Worth understanding WHY, since
  it wasn't the original plan: work started by pushing directly onto
  PR #22's own branch (`feat/sectors-tabbed-explainer`), on the
  reasoning that revising unmerged work belongs on the same branch/PR
  rather than a fresh one — a real, deliberate call at the time, stated
  to the user before starting. **That branch's PR #22 was merged by the
  user MID-SESSION, while this revision work was already underway** —
  discovered only once the commit was pushed and `gh pr edit` was used
  to update PR #22's own description, which came back showing
  `MERGED`. `git log origin/main` confirmed the merge carried ONLY the
  original PR #22 commit — this revision-round commit had been pushed
  AFTER that merge, onto a branch GitHub no longer treats as an open
  PR's head, so it was never actually incorporated into `main` despite
  sitting right there in the branch's own history. Corrected by moving
  the same commit onto a fresh branch (`fix/sectors-grid-revision-round`)
  and opening this PR from it — confirmed via `git diff origin/main...`
  before opening that the diff was genuinely scoped to just this
  revision's own changes, not a re-diff of the whole already-merged
  component. **PR #22's own GitHub description was also reverted back
  to what it said BEFORE this mistake** (a mid-session edit had appended
  a "Revision round" section describing work that was never actually
  part of that merge) — replaced with its real original text plus a
  short, honest pointer to this PR instead. Worth remembering for any
  future session: don't assume a branch's PR is still open just because
  YOU haven't merged it — check `gh pr view <n> --json state` before
  pushing a follow-up commit to an existing PR's branch, especially in
  a session where the user has their own independent access to merge on
  GitHub at any point.

  Full derivation/reasoning for every item below lives in
  `SectorsGrid.astro`'s own updated top-of-file comment and `src/lib/
  sectorsGridReveal.ts`'s own new comment — condensed here, not
  duplicated in full:

  1. **Heading** — `SectionHeading` now `align="center"`, "Who We
     Protect" (was sentence case). Real finding surfaced before either
     change: no sitewide precedent exists for "heading centred, content
     left" (the only prior centring precedent, `ClosingCta`, centres its
     WHOLE section) — proceeded per direct instruction anyway, since
     `SectionHeading`'s own `align` prop only affects its own wrapper,
     with zero cascading effect on the tab bar/panel below. Case fix
     ALSO flagged, not silently treated as resolving a real
     inconsistency: a fresh survey found `ServicesGrid`'s own "Services
     We Offer" is the OUTLIER (Title Case), not the rule — `ClosingCta`/
     `MissionBand`/this section's own prior text were all sentence case.
     Both findings are now folded into the "Left-aligned by default"
     hard rule's own updated text above (a second, narrower centring
     exception) — the heading-case question has no sitewide rule to
     update, so it's flagged only in `SectorsGrid.astro`'s own comment.
  2. **Mobile tabs** — `flex-wrap` reversed to a single-line
     `overflow-x-auto` scroll row, on direct instruction, explicitly NOT
     a case of PR #22's original reasoning being wrong (that reasoning —
     no horizontal-scroll precedent existed anywhere in this codebase —
     is still true; the risk it named is now accepted and mitigated
     instead of avoided). Hidden native scrollbar (a new scoped
     `<style>` block, the first hidden-scrollbar technique anywhere in
     this codebase) + a `mask-image` edge-fade signal more tabs exist
     off-screen.
  3. **Colour fills** — two of six tabs (Events → Electric Blue,
     Corporate → Magenta) reuse `ServicesGrid.astro`'s exact two accent
     hues, per direct instruction — but NOT its real ratio: ServicesGrid
     is actually 3 coloured : 3 light, not 2:4 as the brief assumed,
     flagged rather than silently reconciled either way. Broke the
     existing Ink-hover/Amber-active indicator scheme (invisible/non-
     compliant on a coloured fill) — real, freshly-computed numbers
     showed Amber fails as a universal fix (≈2.41:1 vs Electric Blue,
     though it passes ≈3.38:1 vs Magenta); rebuilt coloured tabs' own
     indicator on Paper instead (their own already-established text
     colour) — solid `border-paper` active (~5.17–7.26:1, reusing
     ServicesGrid's own already-derived numbers), `border-paper/70`
     hover (a FRESH derivation for this alpha-over-a-coloured-fill
     context, 55% — light tabs' own value — only reaches ≈2.63:1 against
     Electric Blue and fails; 70% clears both fills at ≈3.35–4.22:1).
     Confirmed with the user before implementing, per their own explicit
     "not obviously right, confirm first" framing.
  4. **Motion** — a genuinely new, fourth module,
     `src/lib/sectorsGridReveal.ts` — PR #22 originally shipped this
     section with NO scroll entrance at all (deliberate at the time,
     matching the equally-absent entrance on the `SectorsStrip.astro`
     it replaced); closed now on direct instruction. Distinct from all
     THREE existing motion shapes on this site (not just the two the
     brief named) — a divider line-draw (`scaleX` on a NEW dedicated
     `[data-sectors-line]` element, since the tablist's own native
     border couldn't be animated independently of its children) +
     horizontal tab cascade (x-axis, not this site's usual y-rise) + one
     panel fade+scale, one shared `ScrollTrigger`. A genuine nice-to-have
     also landed in the same module: a one-time auto-nudge scroll on the
     mobile tablist's first scroll-into-view, gated on the row actually
     overflowing and on `prefers-reduced-motion`.
  5. **A real regression caught and fixed mid-pass, worth remembering the
     shape of** — THREE separate instances of the exact "dead CSS from a
     doc comment" bug this project's own standing convention already
     warns about were introduced while writing this revision's own new
     comments (`border-ink/55`, `border-paper/70`, and `flex-wrap`, each
     mentioned bare/unprefixed in prose where the only real markup usage
     is `hover:`/`sm:`-prefixed) — caught via the SAME audit discipline
     PR #22's original pass already used once, confirmed via direct
     `dist/` inspection before and after each fix. A genuinely
     UNRELATED, pre-existing, real (non-orphaned) `border-b` compiled
     rule was also investigated during the same audit and confirmed to
     trace to `Header.astro`'s own real usage, not a false positive from
     this pass. One small residual finding, disclosed rather than
     chased further: a bare `.flex-wrap{flex-wrap:wrap}` rule remains in
     the compiled output with no traceable source anywhere in `src/`
     (confirmed via an `overflow-visible` control test that Tailwind
     does NOT generally generate a bare form from a prefix-only mention)
     — investigated as far as was proportionate for a ~20-byte unused
     declaration, not fully explained, flagged honestly rather than
     either hidden or falsely claimed resolved.
  6. **Images** — real photos, six House-of-Guards-branded officer
     images supplied mid-session (a Downloads-folder screenshot,
     filenames `retail`/`Distribution`/`Corporate`/`Events`/`Health`/
     `Education.png`) — already part of `main` via PR #22's own merge
     (which DID complete successfully before the branch confusion above
     happened), unrelated to and unaffected by this PR's own branch
     mix-up. Mentioned here only so the "Not started"/"Current status"
     sections below aren't read as contradicting each other about when
     this happened.

  A real `astro check` (0 errors throughout every round) and a full
  `astro build` + direct `dist/` inspection were run after the complete
  set of six changes (not after each one) — matching the explicit
  build-efficiency instruction for this revision round — plus the three
  extra rebuild+recheck cycles the dead-CSS fixes in item 5 required.
  Confirmed in the FINAL build: 6 tabs (2 coloured, 4 light) with
  correct `data-fill`/class state, the new line element present with
  correct classes, heading centred/Title Case, zero `border-ink/55`/
  `border-paper/70` bare rules, zero `picsum`/`cyan-blue` anywhere, and
  the new `sectorsGridReveal.ts` module's own markers (`scaleX`,
  `data-sectors-line`, `dataset.fill`) present in the compiled JS.

- **PR #22 — `SectorsStrip.astro`'s plain 2×3 photo-caption grid
  replaced outright by `SectorsGrid.astro`, a tabbed sector explainer:
  six tabs (Retail, Distribution, Corporate, Events, Healthcare,
  Education) drive a shared, swapping two-column image+copy panel.
  `SectorsStrip.astro` is DELETED, not kept alongside this — same
  precedent as `ServicesIndex.astro`'s own retirement when
  `ServicesGrid.astro` replaced it.

  **STRUCTURAL REFERENCE ONLY** — uk.loomis.com's "Why Loomis" module
  confirmed the interaction shape (tabs driving one shared content
  panel); nothing about their colours, wavy border, tab shape, or dark
  background was carried over — every visual decision reuses this
  project's own existing tokens/components instead (see below).

  **TAB BAR** — a plain `role="tablist"` `flex flex-wrap` row, NOT a
  horizontal-scroll/snap strip — checked first via a repo grep that no
  such pattern exists anywhere else in this codebase before deciding,
  rather than introducing a brand-new interaction affordance with no
  precedent and the usual "is there more to scroll" discoverability
  problem. Six one-word labels at `text-caption` sit on one row at
  `sm:`+ and wrap to a second row on narrow mobile for free.

  **TAB VISUAL MECHANISM** — reuses `NavLink.astro`'s own established
  technique verbatim (a `border-b-2` that's transparent at rest,
  coloured on hover/active, `transition-colors`) instead of inventing a
  second way to draw an underline. Three states: inactive/rest
  (transparent), inactive/hover (Ink at 55% opacity — see the
  Cyan-Blue note below for why), active/selected (solid Amber, reusing
  the already-accepted header-nav/MissionBand bare-mark pairing,
  ~2.15:1, PR #18). Hover and active classes are structurally mutually
  exclusive per tab (swapped wholesale by `sectorsGridTabs.ts` on every
  state change) — never left coexisting on the same element, since a
  `:hover` pseudo-class rule is MORE specific than a plain class rule
  and would silently mask an active tab's own Amber underline the
  moment it's hovered if both were present at once.

  **CYAN-BLUE — spec'd, then DROPPED before any code was written, a
  real contrast finding, not a style change.** The original brief named
  Cyan-Blue for the tab hover underline ("intentionally the first real
  use of Cyan-Blue in the project"). Recomputed fresh, per this
  project's own standing "never assume a finding carries over, verify
  every new pairing" discipline: Cyan-Blue as a bare mark on Paper is
  ~2.77:1 — FAILS the WCAG 1.4.11 3:1 non-text floor outright (this
  actually matches global.css's own pre-existing note on this exact
  token, missed when the brief was written). Flagged before writing any
  component code; the explicit decision was to drop Cyan-Blue entirely
  (it remains fully unused anywhere in this codebase — global.css's own
  token comment is unchanged, still describing it as "ready for the
  next pass that actually needs it") and use Ink at 55% opacity for the
  hover underline instead, distinguishing hover from active by WEIGHT
  (translucent Ink vs. solid Amber) rather than by a second hue. Ink/55
  was itself computed fresh for this new use, not assumed compliant by
  relative darkness: sRGB blend ≈0.478 → linear luminance ≈0.194 →
  contrast ≈4.30:1 — clears 3:1 with real margin, not a thin pass like
  the Amber active-underline it sits next to.

  **A real "dead CSS from a doc comment" bug, caught and fixed during
  this same pass** — the exact failure class CLAUDE.md's own standing
  convention already warns about (see that convention's own entry
  above), hit for real here: an early draft of this component's own
  top-of-file comment quoted the bare token `` `border-ink/55` `` (no
  `hover:` prefix) in prose, twice — but the ONLY real markup usage
  anywhere in the file is the full `hover:border-ink/55` string. This
  generated a genuine, orphaned `.border-ink\/55{...}` rule (confirmed
  present in the compiled `dist/` output before the fix, confirmed gone
  after it) with zero real call site — Tailwind's scanner does
  plain-text matching across comments too, not comment-aware parsing.
  Fixed by rewording both mentions to prose rather than re-quoting the
  bare class-shaped string.

  **PANEL** — the two-column `MissionBand.astro` shape reused directly
  (image first in DOM/first column, copy second, stacks to one column
  on mobile) rather than inventing a second two-column convention.
  Background is `surface-alt` (a light, neutral, non-accent surface),
  padded, no border/shadow — this is ONE panel, not a repeated card
  grid, so the "no identical bordered/shadowed card grids" hard rule
  doesn't apply to it either way (see that rule's own updated text
  above for the fuller "SectorsStrip's old card-shaped treatment is
  retired, this isn't a new instance of the pattern at all" note).

  **CAPTION** — plain sentence case ("Retail security", etc.), Ink,
  DELIBERATELY NOT tracked-caps/uppercase. The brief asked for a
  "caption" in the panel's content order and specified its colour
  (Ink, not Amber — referencing MissionBand's own caption-contrast bug
  by name) but did not name specific tracked-caps copy or invoke the
  hard rule's own override clause the way MissionBand's brief did
  (that rule bans tracked-caps eyebrow labels above headings by
  default; MissionBand's "Our mission" is the one existing exception,
  built on a direct instruction naming that exact label). Flagged as a
  judgment call at build time rather than silently assumed either way
  — this stays plain sentence case unless a fresh, explicit instruction
  says otherwise, per CLAUDE.md's own "don't read one exception as
  licence for a third" rule.

  **HEADLINE SIZE** — `text-h3` (28px), not MissionBand's own `text-h2`
  (40px): this section already has a `text-h2` main heading ("Who we
  protect") above the tab bar, and giving each swapping panel its own
  `text-h2` too would put two same-weight headings on screen at once.
  `text-h3` is this project's own documented "sub-heads, service names"
  step — the correct register for something subordinate to the
  section's real `<h2>`.

  **IMAGES — six REAL, FINAL assets, not placeholders**, though this
  went through two real phases in one session, worth recording
  honestly. Phase 1 (before any code was written, per an explicit
  decision at the time): Lorem Picsum placeholders, since no
  image-generation capability existed in the environment this
  component was built in — the same interim status `SectorsStrip.astro`
  's own six photos always had. Routed through `astro:assets`' `<Image
  />` per the brief (never a plain `<img>`) — this hit a real, concrete
  build failure before it worked, not a hypothetical one: `picsum.
  photos` 302-redirects every request to a signed `fastly.picsum.
  photos` URL, and Astro's image pipeline refuses to follow a redirect
  to a host that isn't ALSO on the `astro.config.mjs` `image.domains`
  allowlist — listing only `picsum.photos` threw "not an allowed remote
  location" for all six images at build time. Fixed by allowlisting
  both hosts.

  Phase 2 (SAME session, mid-implementation): the user supplied six
  real photos directly (a Downloads-folder screenshot, filenames
  `retail`/`Distribution`/`Corporate`/`Events`/`Health`/`Education.png`)
  — genuine House-of-Guards-branded officer photography (an officer in
  a "HOUSE OF GUARDS" jacket/vest, back-to-camera or profile, one real
  environment per sector: a retail high street, a distribution yard
  with two branded lorries, a corporate lobby with turnstiles and a
  reception desk, a stadium crowd barrier with a hi-vis armband, a
  hospital reception/corridor, a school's main gate with a visitor).
  Copied into `src/assets/sectors/{retail,distribution,corporate,
  events,healthcare,education}.png` (`healthcare`/`education` renamed
  from the supplied `Health`/`Education` to match this component's own
  slug set) and switched to LOCAL imports through `astro:assets`,
  matching `hero-officer.png`/`mission-team.png`'s exact convention —
  the `picsum.photos`/`fastly.picsum.photos` remote-domain allowlist
  from Phase 1 was removed from `astro.config.mjs` again, since nothing
  in the final component uses a remote image source at all. Real,
  written-not-generic alt text for each (checked by actually viewing
  every photo before writing its description, matching this project's
  own `mission-team.png`-alt-text discipline — not a templated "sector
  name — photograph" string).

  REAL native-ratio geometry, checked via `sharp` metadata before
  choosing a crop, not guessed (same discipline `Hero.astro`'s and
  `MissionBand.astro`'s own comments already establish): all SIX real
  photos are 1536×1024, exactly 3:2 — byte-identical dimensions across
  the whole set, and an EXACT match to the panel's `aspect-[3/2]` image
  slot, so `object-cover` performs genuinely zero crop on any of the
  six (no edge-strip inspection needed the way `mission-team.png`'s own
  asymmetric-content check needed one — the ratio match itself already
  proves it). No explicit `width`/`height` prop on the final `<Image
  />` call, matching `mission-team.png`'s own call exactly — a local
  imported asset's native size is already known to Astro's build
  pipeline from the import, so `widths`/`sizes` alone are sufficient;
  `width`/`height` were only ever needed by hand during Phase 1's
  remote-`src` placeholder path. Real compression win, confirmed via
  the actual build log, not assumed: each 1.8–2.0MB source PNG compiled
  down to 10–102KB per responsive `webp` variant (5 widths × 6 photos =
  30 real optimized files, confirmed present in `dist/_astro/`).

  **MOTION** — `src/lib/sectorsGridTabs.ts`, a new module, genuinely
  different in SHAPE from every other motion module on this site: not
  a scroll-triggered entrance at all (no `ScrollTrigger`, no
  `[data-reveal]` marker, not picked up by `initScrollReveal()`), a
  click/keyboard-driven panel crossfade instead. Sequential fade-out-
  then-fade-in (NOT a true simultaneous overlap crossfade) — a
  deliberate choice to avoid ever having two full two-column panels
  laid out and occupying grid space at the same moment mid-transition,
  which this project's own standing convention explicitly flags as a
  real layout-jump risk that no amount of compiled-output inspection
  could catch (and there's no local preview available here to render-
  check one against). Full ARIA tab pattern (WAI-ARIA APG "Tabs with
  Automatic Activation" — arrow-key movement both moves focus and
  selects/shows that tab's panel, Home/End jump to first/last, roving
  `tabindex`) built by hand — no existing tab component anywhere in
  this codebase to reuse. `prefers-reduced-motion`: an instant swap, no
  GSAP tween at all, with any leftover inline opacity/`y` styles from a
  prior transition explicitly cleared (`clearProps`) before toggling
  `[hidden]`, so a runtime preference change mid-session can't leave a
  panel stuck at partial opacity.

  **ICONS** — none added next to the tab labels. The brief made this
  conditional; six new bespoke icon files felt like real scope beyond
  what was asked, and `NavLink.astro`'s own plain-text convention (no
  icon on any nav-style link anywhere on the site) was the closer
  precedent. Flagged, not silently decided — icons are a one-line
  addition to the tab markup if actually wanted.

  **LINKS** — each panel's button points at `/sectors/<slug>` (`retail`,
  `distribution`, `corporate`, `events`, `healthcare`, `education`) —
  none of these routes exist yet. Confirmed via a real `astro build`
  (not assumed) that a plain `<a href>` to a not-yet-created static
  route does NOT fail the build — Astro only validates route
  resolution for `getStaticPaths`/dynamic-route params, not for a
  bare anchor href — so these are dead links today by design, ready for
  the interior `/sectors/*` pages whenever those get built.

  Multiple clean `astro check` runs (0 errors throughout, 37 files,
  same 2 pre-existing `ContactForm.tsx` hints) and five `astro build`
  runs across both image phases were run before calling this done, not
  one build followed by an assumption the rest still held: build 1
  (Picsum, `picsum.photos` only in `image.domains`) genuinely FAILED —
  the redirect-to-`fastly.picsum.photos` error above; build 2 (both
  hosts allowlisted) succeeded, and its compiled output is what
  surfaced the dead-CSS `border-ink/55` bug below; build 3 confirmed
  that fix; build 4, after the real photos replaced the placeholders
  entirely (new local imports, `image.domains` removed again, alt text
  rewritten), succeeded and is where the 30-real-`webp`-variant
  compression numbers above come from; build 5, after two further
  comment-only corrections (a typo, and a wrong claim that `width`/
  `height` were passed explicitly for the final local-asset `<Image
  />` call — they aren't, matching `mission-team.png`'s own
  convention), confirmed nothing regressed. The FINAL compiled-`dist/`
  output (post-build-5, not an earlier one) was inspected directly: 6
  tabs, 6 panels, 6 `/sectors/*` hrefs, exactly 5 hidden panels + 1
  `aria-selected="true"` at load, the real `border-ink/55:hover` rule
  present with the correct `color-mix` opacity, zero `cyan-blue` and
  zero `picsum` anywhere in the output, and all six real, hand-written
  alt strings present in the rendered HTML.

  (Build 2 → 3 above is the real "dead CSS from a doc comment" bug —
  see that paragraph earlier in this entry, right after the TAB VISUAL
  MECHANISM section, for the full account rather than repeating it
  here.)

- **PR #21 — docs-only correction: `text-fine`'s own comment and this
  file both still said 10px after the project owner changed it directly
  to 12px on `main`, outside any PR** (commit `936d2a4`, "Update
  global.css" — confirmed with the owner directly that this was a
  deliberate change, not a mistake, before touching anything). No code
  change here — `global.css`'s value itself was already 12px and stays
  12px; only the surrounding prose was wrong. Fixed both: `text-fine`'s
  own `global.css` comment (previously argued at length for WHY 10px
  specifically, not 12px — that argument directly contradicted the
  value actually shipped, not just a stale number) and this file's own
  Design system section. Both now state the real current fact plainly:
  `text-fine` and `text-micro` are IDENTICAL in font-size (12px) as of
  this change, distinguished only by line-height (1.5 vs 1.4) and each
  step's own documented scope — flagged as a genuine open question
  (keep both as separate steps that happen to share a size, or
  consolidate `ServicesGrid.astro` onto `text-micro` directly) rather
  than resolved unilaterally either way. PR #19's own history entry
  below is left as accurate point-in-time record of what that PR
  actually shipped (10px) — not rewritten — with a forward-pointer
  added to this note instead, the same "history stays historical,
  point forward to what's current" pattern this file already uses
  elsewhere (e.g. the centred-alignment rule's own PR #20 note).

  A real `astro check` and clean `astro build` were run even though
  this is comment-only — confirmed no other file references the old
  "10px" framing, and confirmed via the dead-CSS-from-comments audit
  that nothing in the reworded comment introduces a new backtick-quoted
  Tailwind-class-shaped token (this file's comments are Tailwind-
  scanned like any other `.astro`/`.css` file's).

- **PR #20 — `MissionBand.astro` fully rebuilt: white/Paper background,
  a real two-column image+text layout, Amber accents, a genuine
  clip-path image unveil.** Real, disclosed mismatch worth reading
  before assuming otherwise: the brief described this as "restyle
  existing structure," but the PREVIOUS `MissionBand.astro` was a
  single centred pull-quote on solid Guard Green Deep — no image, no
  caption, no button, no two-column layout. A full repo grep and a
  `git log -S` search for each exact phrase confirmed none of the six
  described pieces (caption, headline, underline, two-column grid,
  button) existed anywhere before this pass — flagged plainly at the
  time rather than silently building net-new content under a "restyle"
  label. The two body paragraphs ARE genuine continuity — the previous
  version's own two sentences, carried over (one had its literal
  curly-quote punctuation stripped, since it was pull-quote-specific
  typography, not part of the sentence; the other is byte-for-byte
  unchanged).

  **New asset**: `src/assets/mission/mission-team.png` (1536×1024,
  AI-generated — four officers, backs to camera, branded jackets, urban
  street — noted for provenance, not as a placeholder; this is the real,
  final asset per direct instruction, the same status `hero-officer.png`
  already has), placed following that exact same convention and
  rendered through `astro:assets`' `<Image />`, never a plain `<img>`.
  REAL geometry checked before choosing a crop, not guessed (same
  discipline `Hero.astro`'s own comment established): cropped edge
  strips of the source confirmed the four officers span roughly 5%–95%
  of the frame width, leaving almost no safe margin for even a modest
  portrait crop — the image is rendered at its own real native ratio,
  `aspect-[3/2]`, uncropped, rather than forcing a taller column crop
  that would have cut into an officer's arm on both edges.

  **TWO real, deliberate, EXPLICIT hard-rule changes, both updated in
  this same commit so code and doc agree** (the same discipline every
  prior rule override in this project has followed):
  - The "no tracked-out ALL-CAPS eyebrow labels" rule gains a second
    named, scoped exception — MissionBand's own "Our mission" caption,
    built on direct instruction naming that exact banned example text,
    invoking the rule's own explicit-override clause.
  - The "centred alignment in exactly two places" rule drops to
    EXACTLY ONE (`ClosingCta`) — MissionBand's old centred pull-quote is
    gone, its text column is left-aligned like every other section's
    default, and this was a deliberate, called-out change per direct
    instruction, not an accidental drift a restyle should have avoided.

  **COLOUR — one genuinely severe contrast bug, flagged at ship time,
  then CONFIRMED and FIXED within the same PR, not left open.** The
  caption label first shipped using Amber as actual TEXT colour
  (~2.15:1 against Paper) — the SAME pairing already reviewed and
  accepted for the header nav's own Amber underline (PR #17/#18), but
  that precedent only ever covered Amber as a bare, non-text, decorative
  mark (3:1 floor). Text needs the stricter 4.5:1 floor (confirmed
  `text-caption` at 14px/500 doesn't qualify for the large-text
  exemption either, same threshold check already run on ServicesGrid's
  own body-text pass) — ~2.15:1 fails BOTH floors, and no prior review
  had ever accepted Amber as running TEXT anywhere on this site. Shipped
  initially per the explicit "Caption label… Amber" instruction, flagged
  prominently in this PR's own description rather than treated as
  equivalent to the already-settled underline case — **on review this
  was confirmed as a genuine contrast-failure BUG, not a design
  preference, and the caption was replaced outright with Ink** (a
  follow-up commit on this same PR, not a separate one), matching the
  sitewide default (~19.44:1 AAA). The underline rule ITSELF (a
  decorative 2px bar, non-text) was never the problem — it correctly
  reuses the already-accepted bare-mark precedent and was left
  untouched by this fix. The button is the unmodified `Button.astro`
  `primary` variant (Amber fill/Ink text, ~9.05:1 AAA) — the same
  component every other primary CTA on the site uses, not a one-off
  style, also untouched. **Standing lesson from this one, worth
  remembering**: Amber's own bare-mark-on-Paper exception (accepted for
  the nav underline) does NOT generalise to Amber-as-text — the two are
  governed by different WCAG floors (3:1 vs 4.5:1) and reusing one
  accepted exception's colour for a different KIND of use needs its own
  fresh check, not an assumption that "it's the same colour, so it's
  already been reviewed."

  **RETIREMENT**: Guard Green Deep is now retired from every homepage
  section — MissionBand was the last one still using it. The token
  itself stays defined in `global.css`: `Button.astro`'s dormant
  `secondary` variant is the one remaining real (if unrendered anywhere)
  reference. `ClosingCta.astro` is now the ONLY section left on the
  Guard Green palette at all (Guard Green Secondary, its own phone-link
  hover decoration, unchanged). See the Design system section's own
  updated SCOPE note for the full current accounting — it's moved
  twice now (the original four-section rebrand, then this pass), don't
  assume either earlier framing still describes the current boundary.

  **MOTION** — a new dedicated module, `src/lib/missionReveal.ts`, not
  bolted onto any existing one: the image gets a PURE clip-path
  "unveil" (no opacity change at all, the one thing that makes it
  genuinely distinct from every fade-based entrance on the rest of the
  site) — `inset(0% 0% 100% 0%)` → `inset(0% 0% 0% 0%)`, which reveals
  the image growing downward from its own top edge (a vertical,
  top-to-bottom unveil; a horizontal wipe was the other option named in
  the brief, vertical was chosen as reading more like a deliberate
  unveiling and less like a slider transition). GSAP tweens `clip-path`
  natively for two same-shape `inset()` strings, no extra plugin. The
  text column's five elements (caption, headline, underline, the two
  paragraphs together as ONE shared beat, button) fade+rise on a single
  shared GSAP `stagger` — the same mechanism `heroMuster.ts` already
  uses for its own cascade, safe here because every element shares one
  scroll trigger, unlike `servicesGridReveal.ts`'s six independent
  per-card triggers. Full `prefers-reduced-motion` fallback: the image
  jumps straight to fully revealed, every text element straight to its
  final position, no ScrollTrigger registered for either.

  A real `astro check` (0 errors, 36 files, same pre-existing unrelated
  `ContactForm.tsx` hints) and clean `astro build` were run, plus the
  dead-CSS-from-comments audit on every touched file — this audit
  caught a REAL instance, not a hypothetical one: an early draft of this
  file's own RETIREMENT paragraph literally spelled out the now-orphaned
  bare `bg-guard-green-deep` class name in a backtick-quoted token,
  which generated a genuine dead rule in the compiled bundle (confirmed
  via direct inspection before fixing) — reworded to prose before
  shipping, the exact failure mode this project's own standing
  convention already warns about, caught in the act rather than assumed
  safe.

  **Follow-up commit, same PR**: the caption's Amber text-colour bug
  (see the colour table's own Amber row above for the fix itself) was
  corrected to Ink. Re-verified with the same discipline — `astro
  check`/`astro build` clean, and confirmed via direct `dist/`
  inspection that `.text-amber{...}` (the foreground-colour utility,
  distinct from `bg-amber`/`border-amber`) disappeared from the compiled
  bundle entirely once the caption stopped using it, since the caption
  was its only real call site anywhere in the codebase — confirmed not
  orphaned by any leftover comment mention either, the same audit this
  PR's own first commit already required.

- **PR #19 — ServicesGrid's card body copy shrunk a second time, past
  `text-caption` (14px), onto a genuinely new ninth type-scale step,
  `text-fine` (10px at the time — changed to 12px directly on `main`
  afterward, outside any PR; see the Design system section's own
  current note on `text-fine` for the up-to-date state, this entry is
  accurate history of what PR #19 itself actually shipped, not the
  current value).** Direct follow-up instruction: "quite a bit
  smaller… not just one more type-scale step down." The scale's only
  other existing step below `text-caption` — `text-micro` (12px) — is
  deliberately scoped to "legal/footer only" by its own comment, and
  reusing it would have both understated the requested drop (14px →
  12px is one tier, not the two-or-more asked for) and blurred that
  scoping. Per this project's own standing rule ("if a new size is
  genuinely needed, add it as a ninth named step… don't improvise one
  inline"), added `text-fine` to `global.css` instead of an arbitrary
  bracket value in the component — 10px, continuing the scale's own
  roughly-consistent ~1.17–1.21× step-down ratio below `text-micro`,
  weight 500/line-height 1.5 matching `text-caption`'s own pairing
  (not `text-micro`'s tighter 1.4, since this tier holds full
  multi-line sentences, not short legal fragments). Heading size
  (`text-h3`) and icon size (`size-12`) are unchanged — only the body
  `<p>` moved.

  **Contrast re-checked at the new size, not assumed to carry over**:
  the colour-pair ratios themselves (white vs Electric Blue/Magenta,
  Ink vs Surface Alt) are a function of colour alone and don't move
  with font size, but which WCAG threshold applies does — confirmed
  10px/500 still doesn't qualify for the 3:1 "large text" exemption
  (needs ≥24px any weight or ≥18.66px at 700+; nowhere close either
  way) any more than 14px/500 did, so this is NOT a threshold
  crossover the way StatStrip's own 28px→20px change genuinely was —
  both sizes were always "normal text," needing the full 4.5:1 floor.
  Re-confirmed all three pairings still clear it: white on Electric
  Blue ~5.17:1, white on Magenta ~7.26:1, Ink on Surface Alt ~17.8:1 —
  identical to PR #17's own numbers, since colour (not size) drives
  these.

  A real `astro check` (0 errors, same pre-existing `ContactForm.tsx`
  hints) and clean `astro build` were run, plus the dead-CSS-from-
  comments audit on both touched files — confirmed `text-fine` compiles
  correctly with real markup usage on all six cards, `text-caption`
  still compiles correctly for its own remaining real use (Header's
  info bar), and every other backtick-quoted token touched by this
  diff is either still-used-elsewhere or empirically confirmed (via the
  compiled bundle, not assumed) to generate nothing.

- **PR #18 — the two contrast/design decisions PR #17 flagged
  (Amber's nav-underline contrast, Hero's scrim opacity) were reviewed
  by the user and both confirmed as accepted tradeoffs, not open
  items.** Comment-only follow-up (no markup/class changes) — landed as
  its own small PR rather than folded into #17, since #17 was merged
  before this documentation commit made it onto the branch (the branch
  was cherry-picked onto fresh `main` and re-opened as #18 rather than
  force-pushed over the closed PR). Updated: `global.css`'s Amber token
  comment, `NavLink.astro`'s own comment, `NavDrawer.tsx`'s mirrored
  link-hover-border comment, `Hero.astro`'s scrim comment, and this
  file (colour table, Architecture conventions bullet, PR #17 entry
  above) — all reframed from "flagged/unresolved" to "reviewed,
  settled, accepted," so neither gets "fixed" unprompted by a future
  session. Amber's underline stays at its shipped ~2.15:1 (below the
  3:1 WCAG 1.4.11 floor, explicitly accepted). Hero's scrim stays at
  85% opacity/~4.53:1 — the offered 90%-opacity alternative (~4.74:1)
  was explicitly declined, no code change made.

- **PR #17 — Electric Blue / Magenta / Amber / Cyan-Blue rebrand,
  SCOPED to exactly four sections: Header, Hero, StatStrip, and
  `ServicesGrid.astro`.** Guard Green Secondary and Guard Green Deep
  are retired from all four (confirmed via a full repo grep before
  calling this done — see the Design system section's own new SCOPE
  note above for the full boundary statement, not repeated here).
  `MissionBand.astro` and `ClosingCta.astro` were explicitly, directly
  instructed to be left untouched — both still run the original Guard
  Green palette, pending a separate future redesign; both Guard Green
  tokens stay defined in `global.css` (not deleted) purely because
  those two sections still reference them.

  **Per-section treatment, all contrast computed fresh, not assumed**
  (full numbers in each token's own `global.css` comment and each
  component's own updated doc block — condensed here):
  - **Header** — info-bar fill Electric Blue (white text/icons,
    ~5.17:1, down from Guard Green Secondary's own ~6.36:1 but still
    real AA margin), `.on-dark` kept (Ink ring ~3.76:1, thin). Active
    nav-link underline Amber, matching the button colour — flagged at
    the time as a real WCAG gap (~2.15:1 as a bare mark on Paper, fails
    3:1); **the user reviewed this exact number after the PR and
    explicitly confirmed keeping it as shipped — a settled, accepted
    tradeoff, not an open item.** `NavDrawer.tsx`'s hand-matched CTA and
    its own link-hover border both moved to Amber alongside it, per the
    standing "keep hand-matched copies in sync" note — this repo's own
    documented drift risk, closed proactively rather than waited on.
  - **Hero** — text-panel scrim Electric Blue at 85% opacity
    (unchanged mechanism, new colour). Re-derived contrast from
    scratch, not carried forward from the old ~12.72:1 figure:
    **~4.53:1** — a genuine PASS but a much thinner margin than the old
    figure, flagged at the time in `Hero.astro`'s own comment. A
    90%-opacity alternative (~4.74:1, real headroom) was computed and
    offered; **the user explicitly declined it — the scrim stays at
    85%/~4.53:1 by deliberate choice, no further action pending here.**
  - **StatStrip** — fill Electric Blue (white text/icons, same ~5.17:1
    as Header's info bar, `.on-dark` kept). `Divider`'s
    `tone="paper-strong"` was RECALIBRATED, not left at its old value —
    60% opacity (tuned for Guard Green Secondary) only reaches ~2.85:1
    against Electric Blue, under the 3:1 floor; now 70%, ~3.35:1. Since
    this tone has exactly one real call site (confirmed via grep), the
    shared token was recalibrated in place rather than forked into a
    second variant.
  - **ServicesGrid** — moved off the old `index % 2` checkerboard onto
    a fixed, PER-SERVICE fill assignment (Manned Guarding/Overnight
    Security: Electric Blue fill; Close Protection: Magenta fill;
    Corporate Security/CCTV Monitoring/Construction Site Security:
    light `surface-alt` cards, Ink text, icon stroked in Electric Blue
    or Magenta per card). Icon GEOMETRY unchanged from PR #16 — only
    light-card icon stroke colour changed, so the mandatory
    rasterise-and-inspect process wasn't re-run (that check is for new
    shapes, not a colour-only edit already verified via WCAG maths).
    Body text reduced one named type-scale tier (`text-body` 17px →
    `text-caption` 14px), same discipline already used on Hero/
    StatStrip — surfaces the same weight quirk StatStrip's own history
    already documents (14px/500 is technically heavier than 17px/400).
    The scoped-only `--color-services-accent-yellow` token PR #16
    introduced is fully REMOVED from `global.css`, not just
    unreferenced — confirmed via grep before deleting.

  **The two standing hard rules PR #16 already carved a scoped
  exception into** ("no gold/amber fill colours"/"no blue", and the
  card-grid rule) are updated again in this same commit so code and
  doc agree — see the Hard rules section's own updated bullet above for
  the full "superseded for these four sections, still fully in force
  everywhere else" reasoning, not repeated here.

  A real `astro check` (0 errors, 35 files, only pre-existing unrelated
  `ContactForm.tsx` hints) and a clean `astro build` were run before
  calling this done, plus the dead-CSS-from-comments audit this file's
  own standing conventions require for every file touched — confirmed
  every new backtick-quoted token in a touched `.astro`/`.tsx` file is
  either real, still-rendered markup or genuinely not shaped like a
  Tailwind utility class, and confirmed via the compiled `dist/`
  output that zero dead rules were generated by any of it (including
  one caught and fixed during this same pass: `Cyan-Blue`'s own first
  documented contrast numbers were computed wrong by hand and corrected
  before shipping — see that token's own `global.css` comment for the
  concrete "verify the math, not just trust the method" reminder this
  left behind).

- **PR #16 — `ServicesIndex.astro`'s accordion replaced outright by
  `ServicesGrid.astro`, a real card grid — a deliberate, explicit
  exception to two standing hard rules, both updated in the same
  commit so the doc and the code agree (see those rules' own updated
  text above for the full reasoning, not repeated here): "no card grid
  for services content" and "no gold/amber fill colours." Built on
  direct, detailed instruction (exact 3×2/mobile-stack layout, exact
  alternating Guard-Green-Secondary/yellow checkerboard fill, exact
  per-card copy) — six cards, icon + heading + body each, left-aligned
  (this section is explicitly NOT a third centred-alignment exception).

  **Yellow is a new, deliberately SCOPED-ONLY token** —
  `--color-services-accent-yellow` (`#FFB606`, same hex as the long-
  retired `guard-yellow`, a coincidence not a revival — see
  `global.css`'s own token comment and the colour table above for the
  full "why a real token and not an arbitrary bracket value, and why
  it's explicitly not a returning global accent" reasoning). Contrast
  computed fresh, not assumed from Guard Yellow's own old numbers even
  though the hex matches: Ink on this fill ~11.06:1 (AAA), white
  ~1.76:1 (fails even the lenient 3:1 floor) — yellow cards therefore
  use Ink text/icon/focus-ring, the OPPOSITE pairing from their green
  neighbours (white/`.on-dark`, reusing StatStrip's already-established
  ~6.36:1 pairing unchanged). `index % 2` alternation, which — with
  this grid's odd 3-column count — produces a genuine checkerboard (row
  two starts on the opposite colour from row one) for free, no
  row/column-aware math needed.

  **Six new bespoke icons**, replacing the retired accordion set's own
  geometry outright at the same six file paths (`src/icons/services/`)
  — building/office facade, a figure inside an open protective arc (not
  a closed ring, not a shield — shields stay permanently banned),
  wall camera, two offset footprints, a hard hat, a crescent moon.
  `stroke-width` bumped from this family's `1.25` baseline to `2` (a
  larger, bolder on-card context than the old compact accordion row) —
  see "Icon set" above for the full sitewide implication of that
  change. Went through the mandatory rasterise-and-look process for
  real, not as a formality — it caught and fixed two genuine problems
  before shipping, not zero: a first Manned Guarding draft (one bigger
  toe-circle flush against the sole) read as a figure-8/snowman, fixed
  by switching to a proper sole-plus-three-small-separated-toe-dots
  construction (the standard footprint pictogram shape, not a tuning
  pass on the broken one); and Overnight Security's crescent needed
  TWO separate fixes in sequence — first, a naive rescale of the old
  icon's own two-shared-endpoint arc formula silently collapsed into a
  symmetric band/bracket shape (an SVG spec rule scales an arc's radius
  up when the given endpoints are too far apart for it, which quietly
  destroyed the intended two-different-radii asymmetry), fixed by
  rebuilding the path from real circle-circle intersection geometry
  instead of guessed coordinates; second, even with that geometry
  correct, a stroke-only render of the same path showed two separate
  nested curves rather than a clean crescent (an inherent property of
  stroking a thin sliver's own boundary), fixed by switching that one
  icon to a solid fill — and a hand-transcription slip (one sweep-flag
  digit, `0` instead of the already-verified-correct `1`) carried the
  WRONG value from the isolated test into the real file regardless,
  rasterising as a near-solid blob, caught only by diffing the exact
  path string actually shipped against the independently-confirmed-
  correct one rather than trusting a second glance at the broken
  render. See `OvernightSecurity.astro`'s own comment for the full,
  granular account — kept there rather than condensed further here,
  since "verify the exact string you shipped, not just the geometry
  you derived" is a real, generalisable lesson worth a future session
  actually reading in full once, not just skimming a summary of.

  **Motion**: a new dedicated module, `src/lib/servicesGridReveal.ts`
  (not a new option bolted onto `scrollReveal.ts`'s existing plain
  fade/rise) — scale-up-from-0.85 + settle-from-a-few-degrees-tilt,
  alternating tilt direction per card, `power3.out` easing throughout
  (no bounce/elastic, matching the sitewide motion rule), staggered via
  an explicit per-card `delay` keyed off column position rather than
  GSAP's own `stagger` option (which only staggers one shared tween
  across a target array — doesn't apply once each card has its OWN
  independent `ScrollTrigger`, which it needs since this section sits
  below the fold). Reduced-motion fallback is the same instant-final-
  state pattern every other entry point on this site already uses.

  A real `astro check` (0 errors, 35 files) and clean `astro build`
  were run before shipping, plus the dead-CSS-from-comments audit this
  file's own standing conventions require for anything touching this
  component family — confirmed clean, nothing orphaned.

- **PR #15 — StatStrip dividers extended to mobile; a permanent fix
  for dead-CSS-from-CLAUDE.md.** Follow-up to PR #14's own divider
  fix, per direct instruction: mobile now gets a real horizontal
  `<hr>` divider between every pair of stacked items too (previously a
  deliberate "no divider, gap-only" mobile treatment) — spacing on
  mobile now comes entirely from the divider's own `my-8` margin, not
  a flex `gap`, so the base row dropped `gap-10`/`gap-0` in favour of
  an explicit `gap-0` and the divider's margin does the work at every
  breakpoint uniformly. No `self-stretch` involved here (unlike the
  vertical variant PR #14 fixed) — a plain block `<hr>` needs nothing
  from its parent's display type, so this one carried no equivalent
  risk. Verified via the same static-harness-plus-`getBoundingClient
  Rect()` method PR #14's own bug demanded: confirmed 2 real, visible
  `<hr>`s at 375px (327px wide, correctly positioned between items,
  vertical dividers correctly `display:none`), and confirmed the
  desktop vertical dividers still stretch to the full 132px row height
  at 1280px with zero regression from the mobile change.

  Also found and permanently fixed a related, structural instance of
  the same "dead CSS from a doc comment" class of bug documented
  above: Tailwind v4's default content scanner covers every plausible
  source file in the project, including `CLAUDE.md` itself — this
  file's own history prose (deliberately keeping backtick-quoted
  *former* class names like `bg-guard-green-deep/18` as a record of
  what changed and why) was regenerating that class as a genuinely
  dead, unused rule in every single build, confirmed present in the
  compiled bundle with zero real call sites anywhere under `src/`.
  Fixed once, permanently, rather than continuing to word around it
  forever: added `@source not "../../CLAUDE.md";` and
  `@source not "../../*.md";` right after the `@import "tailwindcss"`
  line in `global.css`. Confirmed the dead rule is gone from the
  compiled CSS post-fix and nothing else in the bundle changed size or
  content. This means CLAUDE.md is now free to keep quoting old/
  removed class names as historical record without ever regenerating
  dead output again — worth remembering if a *different* root-level
  `.md` file is ever added and genuinely needs scanning for some
  reason (it won't be, under the current glob).

  **Deliberately left open, not auto-merged** — see "Open issue"
  above for why; the user is merging PRs themselves for now given the
  Cloudflare Workers Builds stall.

- **PR #7–#14 — Hero rebuilt from scratch, then StatStrip rebuilt
  three times over.** Condensed summary; see this file's own earlier
  revisions in `git log -p` for the full blow-by-blow if a specific
  decision ever needs re-litigating.
  - **Hero (#7–#10)**: replaced the old placeholder stock-forest photo
    with a real officer photo (`src/assets/hero/hero-officer.png`,
    committed into the repo, not read from a Downloads path at
    runtime — 1672×941px, `object-[16%_22%]` derived from its real
    geometry), reusing `Button.astro`'s existing variants rather than
    forking new button markup. Then, across three follow-up rounds: a
    full-image tint was added (green first, at 15–20% opacity, then
    explicitly switched to black/near-black at 25–30% — `bg-ink/28`,
    not a colour this project's `Ink` token needed a one-off exception
    for), the headline was reduced one named tier, and the subhead was
    reduced twice more on top of that (a genuine ambiguous "decrease
    text size a bit more" request was clarified via AskUserQuestion to
    mean the subhead specifically, not the headline). A visible
    hue-transition "seam" between the black tint and the green
    text-panel scrim at the panel's edge was flagged as a real,
    disclosed risk at the time rather than silently smoothed over or
    hidden — never independently confirmed resolved or still present
    in a later look; worth a real glance if this section is revisited.
  - **StatStrip (#11–#14)**: went through a genuine rebuild-not-restyle
    cycle three times, each a legitimate new instruction rather than a
    correction of the previous pass being "wrong": #11 introduced the
    icon-led three-column layout, custom hand-drawn icons (shield/
    checkmark permanently banned on this project), and wired
    `initScrollReveal()` (`src/lib/scrollReveal.ts`) into `index.astro`
    for the first time — it had existed unused in the codebase before
    this. #12 added solid circular icon badges and switched to centred
    alignment (documented at the time as a third sanctioned exception
    to the left-alignment default). #13 reversed both of those
    (left-aligned again on `sm:`+, centred only on the stacked mobile
    layout per a later explicit follow-up; badges removed, icons now
    plain on the solid fill) and replaced the captions with real
    label+body pairs (24/7, SIA, Since 2023) — CLAUDE.md's own
    left-vs-centre hard rule was reverted in the same commit so the
    doc and the code stayed in agreement, matching the same principle
    used everywhere else in this file. A new `Divider.astro` tone,
    `paper-strong` (60% white, ~3.39:1 vs Guard Green Secondary — the
    pre-existing `paper` tone's 35% only measured ~2.12:1, short of
    WCAG 1.4.11's 3:1 non-text floor), was added specifically for this
    fill. #14 fixed the real `self-stretch`/flex-parent bug that made
    the vertical divider invisible (see the standing-conventions bullet
    above for the full mechanism) and reduced both the label and body
    text one tier each on user feedback that the first version of #13
    read too large.

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
Cloudflare config) and the full homepage (header, hero — a real officer
photo with a black tint overlay and an Electric-Blue text-panel scrim
(rebranded off Guard Green Deep), see PR #7–#10 and the Electric-Blue/
Magenta/Amber rebrand entry below — stat strip — icon-led, three
columns, solid Electric Blue fill (rebranded off Guard Green
Secondary), dividers between every pair of items at every breakpoint,
see PR #11–#15 and the rebrand entry — services grid, a six-card mixed
fill/light layout (Electric Blue, Magenta, and light `surface-alt`
cards, rebranded off the original Guard-Green/Yellow checkerboard), see
PR #16 and the rebrand entry — mission band, a real two-column
image+text section (a genuine AI-generated team photo, not a Picsum
placeholder, plus an "Our mission" caption/headline/underline/two
paragraphs/button, all on plain Paper with Amber accents), rebuilt from
the original centred Guard-Green-Deep pull-quote, see PR #20 — sectors
grid, a tabbed sector explainer (six tabs — Retail, Distribution,
Corporate, Events, Healthcare, Education — driving a shared, swapping
two-column image+copy panel, centred Title-Case heading, a horizontal-
scroll mobile tab bar, real House-of-Guards-branded officer photography
(not placeholders), and its own scroll-triggered entrance motion),
replacing the old plain photo-caption strip, see PR #22, PR #23's own
revision-round entry, PR #25's own re-revision moving the colour off
the tabs and onto the content panel instead, and PR #28's own
reassignment of the panel-fill sequence — "Standards We Refuse
to Drop," a new dark-Ink carousel (8 cards, headline+body, no icon;
native CSS scroll-snap, one/two/three visible at mobile/tablet/desktop,
real Prev/Next arrow controls flanking the row on `md:`+ and stacked
below it on mobile, keyboard ArrowLeft/ArrowRight support, no infinite
loop — disabled at either end instead; the scroll-centred card gets a
thin `border-amber`+shadow highlight, every other card stays plain), a
GENUINELY NEW section rather than a conversion of an existing one
despite the original brief describing it that way — see PR #29's own
entry for the full "checked every branch/commit, this never existed
here" account — closing CTA, footer,
both still on the original Guard Green palette, pending a separate
future redesign). Header, Hero, StatStrip, ServicesGrid, and
MissionBand all run the newer colour system (Electric Blue, Magenta,
Amber, Cyan-Blue, though MissionBand itself only actually uses Amber)
— SectorsGrid ALSO now draws on Electric Blue and Magenta, but (as of
PR #28) as a real fill on FOUR of its six swapping CONTENT PANELS
(Retail/Healthcare → Magenta, Distribution/Events → Electric Blue,
Corporate/Education → plain), not its tabs — the tab bar itself is
plain Ink/Amber only now, identical to every other section's underline
convention, with no second tab-indicator vocabulary left at all (PR
#23's own Paper-based coloured-tab scheme is fully deleted, not
dormant) — plus Amber (its
"Learn more" button, on every panel regardless of background, the
sitewide convention); Cyan-Blue remains fully unused anywhere on the
site, including here (see PR #22's own note on why it was spec'd for
this section and then dropped) — ClosingCta is the only section left
on Guard Green Secondary, and Guard Green Deep's only remaining
reference anywhere is `Button.astro`'s own dormant `secondary`
variant. See the Design system section above for the exact, current
scope boundary — it has moved twice now, don't assume either older
framing still holds.

**Not started**: the interior pages — About, Careers, Our Policies,
Gallery, Contact, plus the six new `/sectors/<slug>` pages SectorsGrid's
own "Learn more" buttons now link to (`retail`/`distribution`/
`corporate`/`events`/`healthcare`/`education`) — none of these routes
exist yet (confirmed via a real `astro build` that a dead internal link
doesn't fail the build, so this is a known, disclosed gap, not an
oversight). All still need building.

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
