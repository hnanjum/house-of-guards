import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Shared portal primitives, built only from the site's own tokens.
 * Buttons follow the sitewide rule: Amber fill + Ink text for the one
 * primary action, sharp corners, no arrows. Touch targets are at least
 * 48px tall because these screens are used on phones, often outdoors.
 */

type Tone = "primary" | "quiet" | "onDark";

const TONE: Record<Tone, string> = {
  primary: "bg-amber text-ink hover:brightness-95 disabled:opacity-50",
  quiet: "border border-ink/20 bg-transparent text-ink hover:border-ink disabled:opacity-50",
  onDark: "border border-paper/40 bg-transparent text-paper hover:border-paper disabled:opacity-50",
};

export function PortalButton({
  tone = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      {...rest}
      className={`text-caption inline-flex min-h-12 items-center justify-center rounded-none px-6 transition-[filter,border-color] duration-200 disabled:cursor-not-allowed ${TONE[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  id,
  hint,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-caption text-ink block">
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={CONTROL}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-micro text-stone mt-2">
          {hint}
        </p>
      )}
    </div>
  );
}

const CONTROL =
  "text-body border-ink/50 text-ink mt-2 block min-h-12 w-full rounded-none border bg-paper px-4 transition-colors focus:border-electric-blue focus:outline-none focus:ring-2 focus:ring-electric-blue/20";

export function SelectField({
  label,
  id,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-caption text-ink block">
        {label}
      </label>
      <select id={id} {...rest} className={CONTROL}>
        {children}
      </select>
    </div>
  );
}

export function TextArea({
  label,
  id,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="text-caption text-ink block">
        {label}
      </label>
      <textarea id={id} rows={4} {...rest} className={`${CONTROL} py-3`} />
    </div>
  );
}

/** Polite status line; `error` adds the alert role so it is announced at once. */
export function Notice({ kind = "info", children }: { kind?: "info" | "error"; children: ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={`text-caption text-ink border-l-2 py-1 pl-4 ${kind === "error" ? "border-magenta" : "border-electric-blue"}`}
    >
      {children}
    </p>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span className="text-caption text-stone">{label}…</span>
    </div>
  );
}

const TZ = "Europe/London";

export const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }).format(new Date(iso));

export const fmtShortDay = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));

export const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso));

/** "420 m" under a kilometre, otherwise "6,300 km" / "1.4 km". */
export function fmtDistance(metres: number) {
  if (metres < 1000) return `${Math.round(metres)} m`;
  const km = metres / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString("en-GB")} km`;
}

export function mapsUrl(site: { latitude: number | null; longitude: number | null; address: string; name: string }) {
  const q = site.latitude != null && site.longitude != null ? `${site.latitude},${site.longitude}` : `${site.name} ${site.address}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
