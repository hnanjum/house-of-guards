import type { ReactNode } from "react";

/**
 * Dashboard building blocks. Content sits on Surface Alt (#F5F5F5) so
 * white panels read as distinct surfaces without shadows; panels use a
 * hairline edge, sharp corners, generous padding. Headings in Lora,
 * data in Montserrat with tabular figures.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
  offset = true,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Leave room for the admin dashboard's fixed mobile bar (below lg). */
  offset?: boolean;
}) {
  return (
    <header className={`border-hairline bg-paper/95 sticky top-0 z-20 border-b backdrop-blur ${offset ? "max-lg:top-14" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-4 px-gutter py-6 md:px-10">
        <div>
          <h1 className="text-h3 sm:text-h2 text-ink">{title}</h1>
          {subtitle && <p className="text-caption text-stone mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="space-y-8 px-gutter py-8 md:px-10">{children}</div>;
}

export function Panel({
  title,
  action,
  children,
  flush = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}) {
  return (
    <section className="border-hairline bg-paper border">
      {title && (
        <div className="border-hairline flex items-center justify-between gap-4 border-b px-6 py-4">
          <h2 className="text-h4 text-ink">{title}</h2>
          {action}
        </div>
      )}
      <div className={flush ? "" : "p-6"}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  note,
  feature = false,
}: {
  label: string;
  value: ReactNode;
  note?: string;
  feature?: boolean;
}) {
  return (
    <div className={feature ? "on-dark bg-electric-blue text-paper p-5 sm:p-6" : "border-hairline bg-paper text-ink border p-5 sm:p-6"}>
      <p className={`text-caption ${feature ? "text-paper/85" : "text-stone"}`}>{label}</p>
      <p className="text-h2 mt-3 tabular-nums leading-none">{value}</p>
      {note && <p className={`text-micro mt-3 ${feature ? "text-paper/85" : "text-stone"}`}>{note}</p>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-body text-stone px-6 py-10">{children}</p>;
}

/** Status word with a small leading mark; the word carries the meaning, the mark is decoration. */
const DOT: Record<string, string> = {
  good: "bg-electric-blue",
  warn: "bg-amber",
  bad: "bg-magenta",
  idle: "bg-hairline",
};

export function Status({ tone, children, wrap = false }: { tone: keyof typeof DOT; children: ReactNode; wrap?: boolean }) {
  return (
    <span className={`text-caption text-ink inline-flex gap-2 ${wrap ? "min-w-0 items-baseline break-words" : "items-center whitespace-nowrap"}`}>
      <span className={`size-2 shrink-0 ${DOT[tone]}`} aria-hidden="true" />
      {wrap ? <span className="min-w-0 break-words">{children}</span> : children}
    </span>
  );
}

export const th = "text-micro text-stone px-6 py-3 text-left font-normal whitespace-nowrap";
export const td = "text-caption text-ink px-6 py-4 align-top";

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">
        <thead className="border-hairline border-b">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-hairline divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-caption bg-amber text-ink inline-flex min-h-11 items-center gap-2 px-5 hover:brightness-95">
      {children}
    </a>
  );
}
