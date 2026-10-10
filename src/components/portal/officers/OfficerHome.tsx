import { useEffect, useState } from "react";
import type { Assignment, ClockEvent } from "../../../lib/portalSupabase";
import { fmtDay, fmtShortDay, fmtTime, Loading, mapsUrl, Notice, PortalButton } from "../ui";
import { addDays, isoDate, startOfToday, ukToInstant } from "../admin/adminData";
import { Empty, Page, PageHeader, Panel, Stat } from "../admin/kit";
import { dutyState, hoursFor, loadClockEvents, loadWorked, respond } from "./data";

/**
 * Officer home: greeting, the duty panel (the shift on now, or the next
 * accepted one — the one Electric Blue moment, with its main action), a
 * row of figures, offers awaiting a reply, and what's coming up.
 */
export default function Home({
  officerId,
  firstName,
  assignments,
  events,
  onChanged,
}: {
  officerId: string;
  firstName: string;
  assignments: Assignment[] | null;
  events: Record<string, ClockEvent[]>;
  onChanged: () => Promise<void>;
}) {
  const [monthHours, setMonthHours] = useState<number | null>(null);

  useEffect(() => {
    const monthStart = ukToInstant(isoDate(new Date()).slice(0, 8) + "01");
    loadWorked(officerId, monthStart, new Date())
      .then(async (worked) => {
        const ev = await loadClockEvents(worked.map((a) => a.id));
        setMonthHours(worked.reduce((n, a) => n + (hoursFor(ev[a.id]) ?? 0), 0));
      })
      .catch(() => setMonthHours(null));
  }, [officerId, events]);

  const header = <PageHeader offset={false} title={`${greeting()}, ${firstName}`} subtitle={fmtDay(new Date().toISOString())} />;
  if (!assignments) {
    return (
      <>
        {header}
        <Page>
          <Loading label="Loading your shifts" />
        </Page>
      </>
    );
  }

  const accepted = assignments.filter((a) => a.status === "accepted");
  const offered = assignments.filter((a) => a.status === "offered");
  const live = accepted.filter((a) => !["done", "missed"].includes(dutyState(a, events[a.id])));
  const featured = live.find((a) => dutyState(a, events[a.id]) === "on-duty") ?? live[0];
  const next = live.filter((a) => a !== featured).slice(0, 5);
  const weekEnd = addDays(startOfToday(), 7).getTime();
  const nextWeek = accepted.filter((a) => Date.parse(a.shift.starts_at) < weekEnd && Date.parse(a.shift.ends_at) > Date.now()).length;

  return (
    <>
      {header}
      <Page>
        {featured ? (
          <DutyPanel a={featured} state={dutyState(featured, events[featured.id])} events={events[featured.id]} />
        ) : (
          <Panel>
            <p className="text-body text-ink">No shifts scheduled.</p>
            <p className="text-caption text-stone mt-1">When the office offers you a shift, it will appear here.</p>
          </Panel>
        )}

        <div className="grid grid-cols-3 gap-px">
          <Stat label="Next 7 days" value={nextWeek} note={`shift${nextWeek === 1 ? "" : "s"}`} />
          <Stat label="This month" value={monthHours == null ? "–" : (Math.round(monthHours * 10) / 10).toFixed(1)} note="hours clocked" />
          <Stat label="To answer" value={offered.length} note={`offer${offered.length === 1 ? "" : "s"}`} />
        </div>

        {offered.length > 0 && (
          <Panel title="Awaiting your reply" flush>
            <ul className="divide-hairline divide-y">
              {offered.map((a) => (
                <OfferRow key={a.id} a={a} onChanged={onChanged} />
              ))}
            </ul>
          </Panel>
        )}

        <Panel
          title="Coming up"
          action={
            <a href="#/shifts" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
              All shifts
            </a>
          }
          flush
        >
          {next.length === 0 ? (
            <Empty>Nothing else booked yet.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {next.map((a) => (
                <li key={a.id}>
                  <ShiftRow a={a} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Page>
    </>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/** One shift as a tappable row: date block, site, hours, chevron. */
export function ShiftRow({ a, note }: { a: Assignment; note?: string }) {
  const [weekday, day] = fmtShortDay(a.shift.starts_at).split(" ");
  return (
    <a href={`#/shift/${a.id}`} className="hover:bg-surface-alt flex items-center gap-5 px-6 py-4">
      <span className="w-10 shrink-0 text-center">
        <span className="text-h4 text-ink block leading-none">{day}</span>
        <span className="text-micro text-stone mt-1 block">{weekday.replace(",", "")}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-caption text-ink block truncate">{a.shift.site.name}</span>
        <span className="text-micro text-stone block tabular-nums">
          {fmtTime(a.shift.starts_at)} – {fmtTime(a.shift.ends_at)}
          {note && ` · ${note}`}
        </span>
      </span>
      <span className="text-stone" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </span>
    </a>
  );
}

const STATE_LINE: Record<string, string> = {
  "on-duty": "On duty now",
  "can-clock-in": "Ready to clock in",
  "not-yet": "Next shift",
};

function DutyPanel({ a, state, events }: { a: Assignment; state: string; events?: ClockEvent[] }) {
  const clockedIn = state === "on-duty" ? events?.find((e) => e.type === "in") : undefined;
  return (
    <section className="on-dark bg-electric-blue text-paper px-6 py-7 sm:px-8" aria-label="Your shift">
      <p className="text-caption text-paper/85">
        {STATE_LINE[state] ?? "Next shift"} · {fmtDay(a.shift.starts_at)}
      </p>
      <p className="text-h2 mt-3 tabular-nums">
        {fmtTime(a.shift.starts_at)} – {fmtTime(a.shift.ends_at)}
      </p>
      <p className="text-h4 mt-4">{a.shift.site.name}</p>
      {a.shift.site.address && <p className="text-caption text-paper/85 mt-1">{a.shift.site.address}</p>}
      {clockedIn && <p className="text-caption text-paper/85 mt-3">Clocked in at {fmtTime(clockedIn.server_time)}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <a href={`#/shift/${a.id}`} className="text-caption bg-amber text-ink inline-flex min-h-12 items-center px-6 hover:brightness-95">
          {state === "on-duty" ? "Clock out" : state === "can-clock-in" ? "Clock in" : "Shift details"}
        </a>
        <a
          href={mapsUrl(a.shift.site)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-caption border-paper/40 text-paper inline-flex min-h-12 items-center border px-6 hover:border-paper"
        >
          Directions
        </a>
      </div>
    </section>
  );
}

function OfferRow({ a, onChanged }: { a: Assignment; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer(status: "accepted" | "declined") {
    setBusy(true);
    setError(null);
    try {
      await respond(a.id, status);
      await onChanged();
    } catch {
      setError("That didn't go through. Try again.");
      setBusy(false);
    }
  }

  return (
    <li>
      <ShiftRow a={a} />
      <div className="flex flex-wrap gap-3 px-6 pb-4 sm:pl-21">
        <PortalButton disabled={busy} onClick={() => answer("accepted")} className="min-h-11">
          Accept
        </PortalButton>
        <PortalButton tone="quiet" disabled={busy} onClick={() => answer("declined")} className="min-h-11">
          Decline
        </PortalButton>
      </div>
      {error && (
        <div className="px-6 pb-4">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </li>
  );
}
