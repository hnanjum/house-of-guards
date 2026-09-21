import { useState, type ReactNode, type SyntheticEvent } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { CONTACT_EMAIL } from "../data/contact";
import {
  FieldShell,
  FloatingInput,
  FloatingTextarea,
  SelectField,
} from "./formFields";

/**
 * Isolated interactive island: Careers application form. Rendered inside
 * `careers.astro`'s own "Get A Quote"-style floating card — this component
 * owns the FORM (fields, labels, validation, submit, status messages) and
 * nothing about the card chrome around it.
 *
 * SAME PATTERN AS `ContactForm.tsx`, deliberately: the field look, the
 * floating labels, the Electric-Blue focus glow, the staggered Framer
 * Motion entrance and the hand-matched Amber submit button all come from
 * `formFields.tsx` (extracted from `ContactForm.tsx`) or are copied from it
 * verbatim. A third React island using Framer Motion is a real departure
 * from `CLAUDE.md`'s "exactly two islands" rule — done on direct
 * instruction ("React island, same pattern as ContactForm.tsx, with Framer
 * Motion"), not drift; the rule text is updated in the same change.
 *
 * SUBMISSION — `ContactForm.tsx` is a STUB: its `handleSubmit` only
 * `console.log`s the fields and then shows a success message, so no
 * enquiry submitted through it ever leaves the visitor's browser. This
 * form deliberately does NOT copy that. It POSTs JSON to whatever URL the
 * `PUBLIC_APPLICATION_ENDPOINT` build-time environment variable holds (a
 * Formspree-style endpoint, or a Cloudflare Worker, once one exists), and
 * shows the success message ONLY if that request returns `ok`. With the
 * variable unset (today), a visitor is told up front, and again if they
 * submit anyway, that online submission isn't live and given the shared
 * contact email instead — nothing is faked and the form is not cleared.
 * `PUBLIC_` is Astro's prefix for variables that are safe to inline into
 * client code; an endpoint URL is not a secret, but any API key must
 * never go here (it would live in the Worker behind the endpoint).
 *
 * NO SPAM PROTECTION — `ContactForm.tsx` has none either. Before an
 * endpoint is switched on, one is needed (a honeypot field is not enough
 * on its own for a public jobs form; Cloudflare Turnstile is the natural
 * fit on this stack). Flagged rather than half-built here.
 *
 * VALIDATION — native `required`/`type="email"` bubbles are turned off
 * (`noValidate`) so every message, the error styling and the focus
 * handling are consistent. On submit: every field is checked, each invalid
 * one gets `aria-invalid` plus an inline message linked by
 * `aria-describedby`, focus moves to the first invalid field, and a
 * summary line (deliberately without a count, which would go stale as
 * fields are fixed) is announced through the polite live region. After a first
 * failed attempt (or once a field has an error) fields re-validate as the
 * visitor edits and leaves them, so an error clears the moment it's fixed.
 * Errors are carried by text, a heavier Ink border and `aria-invalid`,
 * never by colour alone — see `formFields.tsx` for why there is no red.
 *
 * NOT COLLECTED HERE, ON PURPOSE — passport, visa/share code, National
 * Insurance number, proof of address and references. `careers.astro` tells
 * applicants those are requested later, by email. Home address is limited
 * to "town and postcode".
 *
 * LIVE REGIONS — two persistent (always-mounted) containers, not messages
 * that mount with their own role: assistive tech announces a live region's
 * content CHANGING far more reliably than it announces a newly-inserted
 * live element. Polite for the validation summary and success; assertive
 * (`role="alert"`) for a failed send.
 */

type Status = "idle" | "submitting" | "success";

type FieldName = "fullName" | "email" | "phone" | "location" | "position" | "siaBadge";
type Errors = Partial<Record<FieldName, string>>;

// Inlined at build time. Undefined until an endpoint exists.
const ENDPOINT = import.meta.env.PUBLIC_APPLICATION_ENDPOINT as string | undefined;

const POSITION_OPTIONS = [
  { value: "sia-security-officer", label: "SIA Security Officer" },
  { value: "door-supervisor", label: "Door Supervisor" },
  { value: "cctv-monitoring-operator", label: "CCTV Monitoring Operator" },
  { value: "event-steward", label: "Event Steward" },
  { value: "close-protection-officer", label: "Close Protection Officer" },
];

const SIA_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "application-in-progress", label: "Application in progress" },
];

// Tab order, top to bottom — used to focus the first invalid field.
const FIELD_ORDER: FieldName[] = ["fullName", "email", "phone", "location", "position", "siaBadge"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const validators: Record<FieldName, (value: string) => string | undefined> = {
  fullName: (v) => (v.trim() ? undefined : "Enter your full name."),
  email: (v) => {
    if (!v.trim()) return "Enter your email address.";
    return EMAIL_PATTERN.test(v.trim()) ? undefined : "Enter a valid email address, like name@example.com.";
  },
  phone: (v) => {
    if (!v.trim()) return "Enter a phone number we can reach you on.";
    // Allow spaces, dashes and brackets; count digits only. 9–15 covers UK
    // numbers with or without +44 and other international formats.
    const digits = v.replace(/[\s\-()]/g, "");
    return /^\+?\d{9,15}$/.test(digits) ? undefined : "Enter a valid phone number, like 07123 456789.";
  },
  location: (v) => (v.trim() ? undefined : "Enter your town and postcode."),
  position: (v) => (v ? undefined : "Choose the position you're applying for."),
  siaBadge: (v) => (v ? undefined : "Tell us whether you hold a valid SIA badge."),
};

const linkClass = "text-ink underline decoration-hairline underline-offset-2 hover:decoration-ink";

export default function ApplicationForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [sendError, setSendError] = useState<ReactNode>(null);
  const shouldReduceMotion = useReducedMotion();

  const errorCount = Object.values(errors).filter(Boolean).length;

  const revalidateField = (event: SyntheticEvent<HTMLFormElement>) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement;
    const name = target.name as FieldName;
    if (!(name in validators)) return;
    if (!attempted && !errors[name]) return;
    const message = validators[name](target.value);
    setErrors((prev) => (prev[name] === message ? prev : { ...prev, [name]: message }));
  };

  const handleSubmit = async (event: SyntheticEvent<HTMLFormElement, SubmitEvent>) => {
    event.preventDefault();
    if (status === "submitting") return;

    const form = event.currentTarget;
    const value = (name: string) =>
      (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";

    setAttempted(true);
    setSendError(null);

    const nextErrors: Errors = {};
    for (const name of FIELD_ORDER) {
      const message = validators[name](value(name));
      if (message) nextErrors[name] = message;
    }
    setErrors(nextErrors);

    const invalid = FIELD_ORDER.filter((name) => nextErrors[name]);
    if (invalid.length) {
      setShowSummary(true);
      (form.elements.namedItem(invalid[0]) as HTMLElement | null)?.focus();
      return;
    }
    setShowSummary(false);

    if (!ENDPOINT) {
      // Not wired up. Say so; never show a success message for a
      // submission that went nowhere, and keep what the visitor typed.
      setSendError(<UnavailableMessage />);
      return;
    }

    setStatus("submitting");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      if (!response.ok) throw new Error(`Application endpoint responded ${response.status}`);
      form.reset();
      setErrors({});
      setAttempted(false);
      setStatus("success");
    } catch {
      setStatus("idle");
      setSendError(
        <>
          Something went wrong sending your application, and it has not been received. Please try again, or
          email <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>{CONTACT_EMAIL}</a> instead.
        </>,
      );
    }
  };

  const containerVariants = {
    hidden: {},
    visible: { transition: { staggerChildren: shouldReduceMotion ? 0 : 0.07 } },
  };

  const messageMotion = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0 },
    transition: { duration: 0.2 },
  };

  return (
    <form
      onSubmit={handleSubmit}
      onBlur={revalidateField}
      onChange={revalidateField}
      noValidate
      aria-label="Job application"
      className="mt-5"
    >
      {!ENDPOINT && (
        <p className="text-caption text-ink border-ink mb-5 border-l-2 pl-4">
          Our online application form is not accepting submissions yet. To apply now, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      )}

      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={containerVariants}
      >
        <FieldShell>
          <div className="sm:col-span-2">
            <FloatingInput
              id="fullName"
              name="fullName"
              label="Full name"
              required
              autoComplete="name"
              error={errors.fullName}
            />
          </div>
        </FieldShell>

        <FieldShell>
          <FloatingInput
            id="email"
            name="email"
            label="Email"
            type="email"
            required
            autoComplete="email"
            error={errors.email}
          />
        </FieldShell>
        <FieldShell>
          <FloatingInput
            id="phone"
            name="phone"
            label="Phone"
            type="tel"
            required
            autoComplete="tel"
            error={errors.phone}
          />
        </FieldShell>

        <FieldShell>
          <div className="sm:col-span-2">
            <FloatingInput
              id="location"
              name="location"
              label="Town and postcode"
              required
              autoComplete="address-level2"
              error={errors.location}
            />
          </div>
        </FieldShell>

        <FieldShell>
          <SelectField
            id="position"
            name="position"
            label="Position applying for"
            placeholder="Please pick a position"
            options={POSITION_OPTIONS}
            required
            error={errors.position}
          />
        </FieldShell>
        <FieldShell>
          <SelectField
            id="siaBadge"
            name="siaBadge"
            label="Do you hold a valid SIA badge?"
            placeholder="Please choose an answer"
            options={SIA_OPTIONS}
            required
            error={errors.siaBadge}
          />
        </FieldShell>

        <FieldShell>
          <div className="sm:col-span-2">
            <FloatingTextarea id="experience" name="experience" label="Relevant experience (optional)" rows={4} />
          </div>
        </FieldShell>
      </motion.div>

      <p className="text-caption text-stone mt-5">
        By applying you agree we may store and use your details to process your application.
      </p>

      <motion.button
        type="submit"
        disabled={status === "submitting"}
        whileHover={shouldReduceMotion ? undefined : { scale: 1.01 }}
        whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="relative isolate mt-5 inline-flex w-full items-center justify-center overflow-hidden bg-amber px-6 py-3 text-caption text-ink after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:bg-[linear-gradient(115deg,transparent_35%,rgba(255,255,255,0.5)_50%,transparent_65%)] after:-translate-x-full after:transition-transform after:duration-700 after:ease-out hover:after:translate-x-full focus-visible:after:translate-x-full motion-reduce:after:hidden motion-reduce:hover:brightness-95 disabled:pointer-events-none disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Apply"}
      </motion.button>

      <div role="status" aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait">
          {showSummary && errorCount > 0 && (
            <motion.p
              key="summary"
              {...messageMotion}
              className="text-caption text-ink border-ink mt-5 border-l-2 pl-4"
            >
              Please correct the highlighted fields before sending.
            </motion.p>
          )}
          {status === "success" && (
            <motion.p
              key="success"
              {...messageMotion}
              className="text-caption text-ink border-electric-blue mt-5 border-l-2 pl-4"
            >
              Thank you — your application has been received. A member of our team will contact you by email to
              request your documents.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <div role="alert">
        <AnimatePresence mode="wait">
          {sendError && (
            <motion.p
              key="send-error"
              {...messageMotion}
              className="text-caption text-ink border-ink mt-5 border-l-2 pl-4"
            >
              {sendError}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}

function UnavailableMessage() {
  return (
    <>
      Your application has not been sent — online submission isn't switched on yet. Nothing you typed has been
      lost; please email <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>{CONTACT_EMAIL}</a> to apply
      for now.
    </>
  );
}
