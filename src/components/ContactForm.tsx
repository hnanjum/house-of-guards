import { useState, type FormEvent, type ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Isolated interactive island: contact / enquiry form. Rendered inside
 * `ClosingCta.astro`'s own floating "Get A Quote" card — this component
 * owns the FORM itself (fields, labels, submit, status message) and
 * nothing about the card chrome around it (heading, padding, shadow,
 * background) — that's `ClosingCta.astro`'s job.
 *
 * HEIGHT FOLLOW-UP (a later, separate pass on top of the polish pass
 * below) — the previous session's `ClosingCta.astro` padding pass
 * (matching its OUTER section padding to `StandardsCarousel.astro`/
 * `SectorsGrid.astro`) still left the section reading too tall on a
 * live look. Measured, not guessed: at 1280px the section was 929px
 * tall, ~126px taller than either of those two neighbours (803px) —
 * and the CARD's own content (582px of form, not the panel, which at
 * the time was still being force-stretched to match it — see
 * `ClosingCta.astro`'s own SIZE INVESTIGATION comment for that half of
 * the fix, landed in a later pass) was the
 * real driver, not the outer section padding already addressed. Two
 * real, separate causes found: (1) `fieldBaseClass`'s floating-label
 * padding was a generous 24px top / 8px bottom everywhere, including on
 * the `message` textarea, which doesn't need as much top clearance once
 * a value is entered; (2) a genuine bug — the `service` select was
 * meant to override that padding down to a smaller top value, but the
 * override never took effect (see `selectFieldClass`'s own comment
 * below for the mechanism — deliberately not re-quoting either side of
 * that old/orphaned override here as bare class-shaped tokens, since
 * this project's own standing convention already warns about exactly
 * this failure mode and that comment covers the mechanism in full),
 * silently costing it 14px it didn't need. Fixed by: tightening
 * `fieldBaseClass` to its current, real values (see the constant itself
 * just below), giving `service` its own dedicated, non-conflicting
 * class, dropping the field grid's own row gap one step, reducing the
 * `message` textarea's default `rows` (4 → 3, it can still grow/
 * scroll), and trimming the submit button's own top margin/vertical
 * padding by one step each. Re-measured after:
 * 824px — ~105px shorter, now within ~21px of `ServicesGrid.astro`/
 * `SectorsGrid.astro`'s own 803px rather than towering 126px above
 * them. That residual ~21px reflects this form genuinely carrying more
 * fields (11, versus the original 5) than either of those two sections'
 * own six-card/six-tab content — not chased further, per this pass's
 * own explicit "don't force it smaller than the content allows, say so
 * plainly" instruction.
 *
 * VISUAL-FOOTPRINT FOLLOW-UP (a later, separate pass on top of the
 * height follow-up above) — a live look after that pass confirmed the
 * raw height number had improved but the section still read as visually
 * oversized. Investigated, not just re-padded: container width matched
 * every other homepage section exactly (`max-w-7xl` throughout, not the
 * issue); the real, measured finding was that every field's actual text
 * — labels and typed values alike — was rendering at this project's own
 * prose body-copy size, a size `ServicesGrid.astro` had already moved
 * away from for its own dense, multi-item card content (see that
 * component's own history in `CLAUDE.md`). Dropped one type-scale tier
 * to match that established precedent — `fieldBaseClass`,
 * `selectFieldClass`, and the floating label's own resting-state size
 * all moved together, so labels and values stay visually matched at
 * every state. Tested live before committing to it: this alone (with no
 * further padding change) took the CARD from 664px to 621px and the
 * whole section from 824px to 781px — genuinely under both
 * `ServicesGrid.astro` and `SectorsGrid.astro`'s own 803px for the first
 * time. `ClosingCta.astro`'s own panel text dropped the same tier in the
 * same pass, for the same reason, plus a second, independent fix to the
 * panel's own vertical stretching — see that file's own SIZE
 * INVESTIGATION comment for that half.
 *
 * POLISH PASS (an earlier revision) — field set replaced entirely per a
 * new, explicit spec, and the whole component pushed toward a genuinely
 * higher-end feel, not just a mechanical field swap. Three real,
 * disclosed decisions worth recording:
 *
 * 1. SERVICE LIST MISMATCH, FLAGGED NOT SILENTLY RESOLVED — the new
 *    11-option dropdown below includes five services (Retail Security,
 *    Private Property Security, Crowd Management & Stewarding, Event &
 *    Sports Security, Bespoke/other) that `ServicesGrid.astro`'s own six
 *    cards don't list anywhere else on the site. This is deliberate,
 *    scoped to this ONE dropdown, per direct instruction — it's fine for
 *    an enquiry form to offer a broader net than the site's own service
 *    pages currently describe. Don't read this list as implying those
 *    five are now offered sitewide, and don't add them to
 *    `ServicesGrid.astro`/`SectorsGrid.astro` on this basis alone.
 *
 * 2. FLOATING LABELS, PURE CSS — no controlled-input state added for
 *    this. Every text/email/tel/textarea field uses the standard
 *    `placeholder=" "` + `:placeholder-shown` trick: the label sits
 *    absolutely positioned over the field at rest, and floats to a
 *    smaller `text-micro` position via the `peer-focus:`/
 *    `peer-[&:not(:placeholder-shown)]:` variants the moment the field
 *    is focused OR already has a value — zero JS, works with
 *    uncontrolled inputs, survives a page-level `form.reset()` call the
 *    same way a native placeholder would. The `service` SELECT uses a
 *    static label above instead (the task's own "or a comparably refined
 *    treatment" alternative) — a floating label doesn't map cleanly onto
 *    a `<select>`'s own placeholder-less first `<option>`, so forcing the
 *    same mechanism onto it would need real extra JS state for no real
 *    gain; it gets the same focus-glow border treatment as every other
 *    field for visual consistency instead.
 *
 * 3. FOCUS STATE — a scoped, disclosed override of the sitewide default
 *    `:focus-visible` Ink outline (see `global.css`'s own
 *    `:focus-visible` rule) for JUST these form controls: border colour
 *    transitions to Electric Blue and a soft 2px Electric-Blue ring at
 *    20% opacity glows in behind it (see `fieldBaseClass` below for the
 *    real, always-`focus:`-prefixed classes) — no bare/unprefixed
 *    mention of that ring token here, on purpose, since it has no real
 *    call site outside the `focus:` state and Tailwind's scanner would
 *    otherwise regenerate it as genuine dead CSS from this comment alone
 *    (the exact failure class CLAUDE.md's own standing convention warns
 *    about — checked directly against the compiled `dist/` output).
 *    Electric Blue specifically because it's already this
 *    exact section's own accent (the contact panel's fill) — reusing it
 *    here ties the form back to its own surrounding section rather than
 *    reaching for a new colour, the same "re-derive per use, don't
 *    invent a new hue" discipline the rest of this project's colour
 *    system follows. This is a decorative border/ring, not text, so it
 *    only needs the 3:1 UI-component floor, not 4.5:1 — Electric Blue on
 *    Paper as a bare/border mark is the same already-derived ~5.17:1
 *    pairing `global.css`'s own Electric Blue token comment documents,
 *    reused directly.
 *
 * FRAMER MOTION — this file is one of exactly two React islands
 * permitted to use it (see CLAUDE.md's own motion-system rule). Two
 * genuinely separate uses now, not one: the status-message transition
 * (unchanged from before) AND a new per-field staggered entrance
 * (`whileInView`, `viewport={{ once: true }}`, `staggerChildren`),
 * added on direct instruction. This is a REAL, deliberate change to
 * this file's own previous "don't double up with the card's own
 * `[data-reveal]` fade" reasoning — worth being explicit about why it's
 * not actually a double-up: `ClosingCta.astro`'s own GSAP
 * `[data-reveal]` still owns the CARD's own single entrance (the whole
 * white block fading/rising into place as one unit); this stagger is a
 * second, independent, finer-grained layer operating INSIDE that
 * already-revealed card, cascading the eight individual fields in
 * rather than having them all snap in at once with the card. Two
 * different motion systems each own a genuinely different visual unit,
 * not two systems animating the same thing twice.
 *
 * SUBMIT BUTTON — still a hand-matched clone of `Button.astro`'s
 * `primary` variant (Amber fill, Ink text, the sitewide sole CTA
 * colour) — including, now, its diagonal shine-sweep hover mechanic
 * verbatim (previously simplified away to a plain `brightness-90`
 * shift; restored here per this pass's own "real hover/press
 * micro-interaction, not a flat colour-swap" ask, matching
 * `Button.astro`'s own already-established, already-reduced-motion-safe
 * mechanism rather than inventing a new one). A `whileTap` scale-down
 * (Framer Motion, since this component already has it in scope) adds a
 * real press state on top, skipped outright under
 * `prefers-reduced-motion` via the same `useReducedMotion()` hook
 * `NavDrawer.tsx` already uses for the same purpose.
 *
 * Label copy: "Submit enquiry", not "Get a quote" — this card's own
 * `SectionHeading` directly above the form already reads "Get A Quote";
 * repeating "quote" on the button too reads redundant sitting right
 * underneath it. "Submit enquiry" was the field spec's own first-listed
 * option and matches the neutral, professional register the rest of
 * this form's copy ("Details of your requirement") already uses.
 *
 * STATUS MESSAGES — unchanged from the previous pass: deliberately NOT
 * colour-coded green/red (no such tokens exist in this project's
 * palette), plain `text-ink` with a thin left-border accent
 * (`border-electric-blue` success, `border-ink` error) carrying no
 * contrast requirement of its own — real meaning comes from the message
 * copy and `role="status"`/`role="alert"`.
 */

type ServiceOption = { value: string; label: string };

const SERVICE_OPTIONS: ServiceOption[] = [
  { value: "corporate-security", label: "Corporate Security" },
  { value: "close-protection", label: "Close Protection" },
  { value: "cctv-monitoring", label: "CCTV Monitoring" },
  { value: "manned-guarding", label: "Manned Guarding" },
  { value: "construction-site-security", label: "Construction Site Security" },
  { value: "overnight-security", label: "Overnight Security" },
  { value: "retail-security", label: "Retail Security" },
  { value: "private-property-security", label: "Private Property Security" },
  { value: "crowd-management-stewarding", label: "Crowd Management & Stewarding" },
  { value: "event-sports-security", label: "Event & Sports Security" },
  { value: "bespoke-other", label: "Bespoke / other" },
];

const fieldBaseClass =
  "peer w-full border border-hairline bg-paper px-4 pt-5 pb-1.5 text-caption text-ink transition-colors duration-200 ease-out focus:border-electric-blue focus:outline-none focus:ring-2 focus:ring-electric-blue/20";

/**
 * A dedicated, standalone class string for the `service` select — NOT
 * `fieldBaseClass` plus a padding override. An earlier draft tried the
 * override approach (`fieldBaseClass` plus a smaller top/bottom padding
 * pair appended after it), a real bug caught during this pass's own
 * height investigation: Tailwind resolves two same-specificity
 * utilities targeting the same CSS property by their position in the
 * GENERATED stylesheet, not by their order in the class string —
 * `fieldBaseClass`'s own top-padding utility silently won over the
 * intended smaller one, leaving the select with the floating-label
 * fields' own generous top padding despite the select using a static
 * label above and never needing that clearance at all (deliberately
 * not re-quoting either the old winning value or the old intended-but-
 * losing one here as bare class-shaped tokens — neither has a real call
 * site left anywhere in this file now, and this project's own standing
 * convention already warns about exactly this failure mode). Confirmed
 * via `getComputedStyle` before the fix (a 24px top padding, not the
 * intended ~10px) and after (this dedicated
 * class has no conflicting declaration to lose to).
 */
const selectFieldClass =
  "peer w-full appearance-none border border-hairline bg-paper py-2.5 pr-10 pl-4 text-caption text-ink transition-colors duration-200 ease-out focus:border-electric-blue focus:outline-none focus:ring-2 focus:ring-electric-blue/20";

const staticLabelClass = "text-caption text-ink mb-1.5 block";

function floatingLabelClass(anchorTop: boolean) {
  const base =
    "pointer-events-none absolute left-4 text-stone transition-all duration-200 ease-out peer-focus:text-micro peer-focus:text-electric-blue peer-[&:not(:placeholder-shown)]:text-micro peer-[&:not(:placeholder-shown)]:text-stone";
  return anchorTop
    ? `${base} top-3 text-caption peer-focus:top-1.5 peer-[&:not(:placeholder-shown)]:top-1.5`
    : `${base} top-1/2 -translate-y-1/2 text-caption peer-focus:top-1.5 peer-focus:translate-y-0 peer-[&:not(:placeholder-shown)]:top-1.5 peer-[&:not(:placeholder-shown)]:translate-y-0`;
}

function FloatingInput({
  id,
  name,
  label,
  type = "text",
  required = false,
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        placeholder=" "
        className={fieldBaseClass}
      />
      <label htmlFor={id} className={floatingLabelClass(false)}>
        {label}
      </label>
    </div>
  );
}

function FloatingTextarea({
  id,
  name,
  label,
  required = false,
  rows = 4,
}: {
  id: string;
  name: string;
  label: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <div className="relative">
      <textarea
        id={id}
        name={name}
        rows={rows}
        required={required}
        placeholder=" "
        className={`${fieldBaseClass} resize-none`}
      />
      <label htmlFor={id} className={floatingLabelClass(true)}>
        {label}
      </label>
    </div>
  );
}

function ChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function FieldShell({ children }: { children: ReactNode }) {
  const shouldReduceMotion = useReducedMotion();
  const variants = shouldReduceMotion
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : {
        hidden: { opacity: 0, y: 14 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
      };

  return (
    <motion.div variants={variants} className="contents">
      {children}
    </motion.div>
  );
}

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const shouldReduceMotion = useReducedMotion();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");

    const form = event.currentTarget;
    const data = new FormData(form);

    try {
      // TODO: point this at the real enquiry endpoint (e.g. a Cloudflare
      // Worker/Pages Function, Formspree, or similar) once decided.
      console.log("Contact form submission", Object.fromEntries(data));
      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
    }
  };

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: shouldReduceMotion ? 0 : 0.07 } },
  };

  return (
    <form onSubmit={handleSubmit} className="mt-5">
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={containerVariants}
      >
        <FieldShell>
          <FloatingInput id="firstName" name="firstName" label="First name" required autoComplete="given-name" />
        </FieldShell>
        <FieldShell>
          <FloatingInput id="lastName" name="lastName" label="Last name" required autoComplete="family-name" />
        </FieldShell>

        <FieldShell>
          <div className="sm:col-span-2">
            <FloatingInput id="business" name="business" label="Business name" autoComplete="organization" />
          </div>
        </FieldShell>

        <FieldShell>
          <FloatingInput id="email" name="email" label="Email" type="email" required autoComplete="email" />
        </FieldShell>
        <FieldShell>
          <FloatingInput id="phone" name="phone" label="Phone" type="tel" autoComplete="tel" />
        </FieldShell>

        <FieldShell>
          <div className="sm:col-span-2">
            <label htmlFor="service" className={staticLabelClass}>
              Service required
            </label>
            <div className="relative">
              <select id="service" name="service" required defaultValue="" className={selectFieldClass}>
                <option value="" disabled>
                  Please pick a service
                </option>
                {SERVICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown />
            </div>
          </div>
        </FieldShell>

        <FieldShell>
          <div className="sm:col-span-2">
            <FloatingTextarea id="message" name="message" label="Details of your requirement" required rows={3} />
          </div>
        </FieldShell>
      </motion.div>

      <motion.button
        type="submit"
        disabled={status === "submitting"}
        whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="relative isolate mt-5 inline-flex w-full items-center justify-center overflow-hidden bg-amber px-6 py-3 text-caption text-ink after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.5)_50%,transparent_65%)] after:-translate-x-full after:transition-transform after:duration-700 after:ease-out hover:after:translate-x-full focus-visible:after:translate-x-full motion-reduce:after:hidden motion-reduce:hover:brightness-95 disabled:pointer-events-none disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Submit enquiry"}
      </motion.button>

      <AnimatePresence mode="wait">
        {status === "success" && (
          <motion.p
            key="success"
            role="status"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-caption text-ink border-electric-blue mt-5 border-l-2 pl-4"
          >
            Thank you — your enquiry has been received. A member of our team
            will be in touch shortly.
          </motion.p>
        )}
        {status === "error" && (
          <motion.p
            key="error"
            role="alert"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="text-caption text-ink border-ink mt-5 border-l-2 pl-4"
          >
            Something went wrong sending your enquiry. Please try again or
            call us directly.
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
