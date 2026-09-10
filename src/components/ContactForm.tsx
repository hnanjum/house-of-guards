import { useState, type FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Status = "idle" | "submitting" | "success" | "error";

/**
 * Isolated interactive island: contact / enquiry form. Rendered inside
 * `ClosingCta.astro`'s own floating "Get A Quote" card — this component
 * owns the FORM itself (fields, labels, submit, status message) and
 * nothing about the card chrome around it (heading, padding, shadow,
 * background) — that's `ClosingCta.astro`'s job, so this stays reusable
 * if a future dedicated `/contact` page ever wants the same form inside
 * a different wrapper.
 *
 * REDESIGNED from a completely bare, zero-`className` version (every
 * field was a plain unstyled native element) — checked first, per
 * direct instruction, rather than assumed either way. Styled to match
 * this project's own established polish level, not a fresh invention:
 * `border-hairline` on inputs (the site's own neutral rule/border
 * token), `text-caption` labels (14px/weight 500 — already this
 * scale's own "meta/label" step, see global.css's own type-scale
 * comment), `text-body` field values. `border-radius: 0` on every
 * native `input`/`textarea`/`select`/`button` is ALREADY a global reset
 * in `global.css` ("Sharp corners is a deliberate, sitewide decision")
 * — nothing here repeats it.
 *
 * Framer Motion stays scoped to just this component's own status-
 * message transitions, per CLAUDE.md's motion-system rule ("Framer
 * Motion is scoped to exactly two React islands... only for their own
 * local interactive transitions"). This does NOT add its own scroll
 * entrance — the CARD it sits inside already gets one generic
 * `[data-reveal]` fade/rise from `ClosingCta.astro`'s own
 * `scrollReveal.ts` wiring; animating the form a second time here would
 * double up on the same entrance with two separate motion systems.
 *
 * SUBMIT BUTTON — a hand-matched clone of `Button.astro`'s `primary`
 * variant (Amber fill, Ink text — "the sole button/CTA colour,
 * sitewide, no exceptions"), not an import: this is a `.tsx` file, it
 * can't import an `.astro` component, the exact same constraint
 * `NavDrawer.tsx`'s own CTA already has. Simplified to a plain
 * `hover:brightness-90` shift rather than porting the primary variant's
 * own `::after` diagonal shine-sweep — matching `NavDrawer.tsx`'s own
 * existing precedent for this exact situation (a hand-matched Amber/Ink
 * CTA outside `Button.astro` itself), not a fresh decision made here.
 * Per CLAUDE.md's own standing instruction ("check NavDrawer.tsx by
 * hand any time Button.astro's primary variant changes"), the same now
 * applies to this file — if `Button.astro`'s `primary` fill/text colour
 * ever changes, check both `NavDrawer.tsx` AND this file by hand.
 *
 * STATUS MESSAGES — deliberately NOT colour-coded green/red. No such
 * tokens exist in this project's palette at all (Ink / Paper / Electric
 * Blue / Magenta / Amber / Cyan-Blue / Stone / Hairline / Footer Grey /
 * Surface Alt, plus the one remaining retired Guard Green Deep token —
 * see global.css's own `@theme` block) — inventing a new ad hoc
 * semantic red/green here would be exactly the "reach for a colour
 * outside the token system" the whole design system exists to prevent.
 * Both messages render as plain `text-ink` body copy with a thin left
 * border for visual weight only: `border-electric-blue` for success
 * (this component's own "primary/informational" accent, reused as a
 * bare non-text mark — the same way `StandardsCarousel.astro`/
 * `SectorsGrid.astro` already reuse Amber as a bare mark rather than a
 * fill; a decorative border isn't running text, so it doesn't need the
 * 4.5:1 text floor), `border-ink` for error (the sitewide neutral).
 * Semantic meaning is carried by the message COPY and the
 * `role="status"`/`role="alert"` attributes, not by colour alone — this
 * also sidesteps WCAG 1.4.1's "don't convey meaning by colour alone"
 * concern rather than accidentally tripping it with an invented red.
 */

const inputClass =
  "w-full border border-hairline bg-paper px-4 py-2.5 text-body text-ink placeholder:text-stone transition-colors duration-200 ease-out focus:border-ink";

const labelClass = "text-caption text-ink mb-1.5 block";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");

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

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={labelClass}>
            Name
          </label>
          <input id="name" name="name" type="text" required autoComplete="name" className={inputClass} />
        </div>

        <div>
          <label htmlFor="company" className={labelClass}>
            Company (optional)
          </label>
          <input id="company" name="company" type="text" autoComplete="organization" className={inputClass} />
        </div>

        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
        </div>

        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input id="phone" name="phone" type="tel" autoComplete="tel" className={inputClass} />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="service" className={labelClass}>
            Service required
          </label>
          <select id="service" name="service" defaultValue="" className={inputClass}>
            <option value="" disabled>
              Select a service
            </option>
            <option value="manned-guarding">Manned guarding</option>
            <option value="event-security">Event security</option>
            <option value="close-protection">Close protection</option>
            <option value="mobile-patrols">Mobile patrols</option>
            <option value="other">Other / not sure</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="message" className={labelClass}>
            Message
          </label>
          <textarea
            id="message"
            name="message"
            rows={4}
            required
            className={`${inputClass} resize-none`}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="bg-amber text-ink hover:brightness-90 mt-6 inline-flex w-full items-center justify-center px-6 py-3 text-caption transition-[filter] duration-200 ease-out disabled:pointer-events-none disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Send enquiry"}
      </button>

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
