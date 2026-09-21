import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Shared form primitives for the site's two form islands —
 * `ContactForm.tsx` (homepage/sector-page quote form) and
 * `ApplicationForm.tsx` (Careers). Extracted verbatim from
 * `ContactForm.tsx`, where they were file-private, so the second form
 * reuses the exact same field look, floating-label mechanism, focus
 * treatment and staggered entrance instead of carrying a copy. See
 * `ContactForm.tsx`'s own top-of-file comment for the full history of why
 * each of these looks the way it does (floating labels via the
 * `:placeholder-shown` peer trick, the scoped Electric-Blue focus glow
 * replacing the sitewide Ink outline, the select's own standalone class
 * string, the staggered `whileInView` entrance).
 *
 * The one addition over what `ContactForm.tsx` had: an optional `error`
 * prop on the inputs, for `ApplicationForm.tsx`'s validation. It adds
 * `aria-invalid`, an `aria-describedby` link to an inline message, and an
 * Ink border via the `aria-invalid:` variant. A variant, not a second
 * border-colour class next to the resting one, on purpose: two same-
 * specificity utilities for one CSS property are resolved by their order
 * in the generated stylesheet, not by their order in a class string (the
 * exact trap `selectFieldClass`'s own comment records), whereas the
 * attribute selector this variant compiles to is strictly more specific.
 * No red: this project's palette has no such token and inventing one for
 * one form is exactly what the token system exists to prevent, so an
 * error is carried by the message text, the heavier Ink border and
 * `aria-invalid`, never by colour alone.
 *
 * Framer Motion: this module is a third file importing it (alongside
 * `NavDrawer.tsx` and `ContactForm.tsx`) — `FieldShell` is the stagger
 * wrapper both forms need. See the Motion system section of `CLAUDE.md`
 * for how the "two islands" rule was extended for the Careers form.
 */

export const fieldBaseClass =
  "peer w-full border border-hairline bg-paper px-4 pt-5 pb-1.5 text-caption text-ink transition-colors duration-200 ease-out focus:border-electric-blue focus:outline-none focus:ring-2 focus:ring-electric-blue/20";

/**
 * A dedicated, standalone class string for a select — NOT
 * `fieldBaseClass` plus a padding override. An earlier draft tried the
 * override approach (`fieldBaseClass` plus a smaller top/bottom padding
 * pair appended after it), a real bug caught during the contact form's own
 * height investigation: Tailwind resolves two same-specificity
 * utilities targeting the same CSS property by their position in the
 * GENERATED stylesheet, not by their order in the class string —
 * `fieldBaseClass`'s own top-padding utility silently won over the
 * intended smaller one, leaving the select with the floating-label
 * fields' own generous top padding despite the select using a static
 * label above and never needing that clearance at all (deliberately
 * not re-quoting either the old winning value or the old intended-but-
 * losing one here as bare class-shaped tokens — neither has a real call
 * site left anywhere now, and this project's own standing
 * convention already warns about exactly this failure mode). Confirmed
 * via `getComputedStyle` before the fix (a 24px top padding, not the
 * intended ~10px) and after (this dedicated
 * class has no conflicting declaration to lose to).
 */
export const selectFieldClass =
  "peer w-full appearance-none border border-hairline bg-paper py-2.5 pr-10 pl-4 text-caption text-ink transition-colors duration-200 ease-out focus:border-electric-blue focus:outline-none focus:ring-2 focus:ring-electric-blue/20";

export const staticLabelClass = "text-caption text-ink mb-1.5 block";

const errorBorderClass = "aria-invalid:border-ink";

export function floatingLabelClass(anchorTop: boolean) {
  const base =
    "pointer-events-none absolute left-4 text-stone transition-all duration-200 ease-out peer-focus:text-micro peer-focus:text-electric-blue peer-[&:not(:placeholder-shown)]:text-micro peer-[&:not(:placeholder-shown)]:text-stone";
  return anchorTop
    ? `${base} top-3 text-caption peer-focus:top-1.5 peer-[&:not(:placeholder-shown)]:top-1.5`
    : `${base} top-1/2 -translate-y-1/2 text-caption peer-focus:top-1.5 peer-focus:translate-y-0 peer-[&:not(:placeholder-shown)]:top-1.5 peer-[&:not(:placeholder-shown)]:translate-y-0`;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-caption text-ink border-ink mt-1.5 border-l-2 pl-3">
      {message}
    </p>
  );
}

export function FloatingInput({
  id,
  name,
  label,
  type = "text",
  required = false,
  autoComplete,
  error,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={type}
          required={required}
          autoComplete={autoComplete}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={error ? `${fieldBaseClass} ${errorBorderClass}` : fieldBaseClass}
        />
        <label htmlFor={id} className={floatingLabelClass(false)}>
          {label}
        </label>
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function FloatingTextarea({
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

export function ChevronDown() {
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

/**
 * Select with a static label above (a floating label doesn't map onto a
 * select's placeholder-less first option — see `ContactForm.tsx`'s own
 * comment) and the same optional `error` treatment as `FloatingInput`.
 * `ContactForm.tsx` keeps its own inline select markup; this wrapper exists
 * for the second form's two selects, and renders the identical structure.
 */
export function SelectField({
  id,
  name,
  label,
  placeholder,
  options,
  required = false,
  error,
}: {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  required?: boolean;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className={staticLabelClass}>
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          required={required}
          defaultValue=""
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={error ? `${selectFieldClass} ${errorBorderClass}` : selectFieldClass}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown />
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function FieldShell({ children }: { children: ReactNode }) {
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
