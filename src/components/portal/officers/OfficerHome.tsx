import { useState } from "react";
import type { Assignment, ClockEvent } from "../../../lib/portalSupabase";
import { fmtDay, fmtShortDay, fmtTime, mapsUrl, Notice, PortalButton } from "../ui";
import { dutyState, respond } from "./data";

/**
 * Officer home. One bold moment only: the "duty panel" — the shift the
 * officer is on now, or their next accepted one — as an Electric Blue
 * block with the hours set large in Lora (white on Electric Blue
 * ~5.17:1; `on-dark` for its focusable links). Everything else is quiet
 * Paper rows on hairlines: shifts awaiting a reply, then the rest.
 */
export default function OfficerHome({
  firstName,
  assignments,
  events,
  onChanged,
}: {
  firstName: string;
  assignments: Assignment[];
  events: Record<string, ClockEvent[]>;
  onChanged: () => Promise<void>;
}) {
  const accepted = assignments.filter((a) => a.status === "accepted");
  const offered = assignments.filter((a) => a.status === "offered");
  const live = accepted.filter((a) => {
    const s = dutyState(a, events[a.id]);
    return s !== "done" && s !== "missed";
  });
  const featured = live.find((a) => dutyState(a, events[a.id]) === "on-duty") ?? live[0];
  const rest = live.filter((a) => a !== featured);

  return (
    <div>
      <p className="text-caption text-stone">{fmtDay(new Date().toISOString())}</p>
      <h1 className="text-h2 text-ink mt-2">{greeting()}, {firstName}</h1>

      {featured ? (
        <DutyPanel a={featured} state={dutyState(featured, events[featured.id])} events={events[featured.id]} />
      ) : (
        <div className="border-hairline mt-10 border-t pt-8">
          <p className="text-body-lg text-ink">No shifts scheduled.</p>
          <p className="text-body text-stone mt-2">When the office assigns you a shift, it will appear here.</p>
        </div>
      )}

      {offered.length > 0 && (
        <section className="mt-16" aria-labelledby="awaiting">
          <h2 id="awaiting" className="text-h3 text-ink">
            Awaiting your reply
          </h2>
          <ul className="divide-hairline border-hairline mt-6 divide-y border-y">
            {offered.map((a) => (
              <OfferRow key={a.id} a={a} onChanged={onChanged} />
            ))}
          </ul>
        </section>
      )}

      {rest.length > 0 && (
        <section className="mt-16" aria-labelledby="upcoming">
          <h2 id="upcoming" className="text-h3 text-ink">
            Upcoming
          </h2>
          <ul className="divide-hairline border-hairline mt-6 divide-y border-y">
            {rest.map((a) => (
              <li key={a.id}>
                <a href={`#/shift/${a.id}`} className="group flex items-baseline gap-6 py-5">
                  <DateMark iso={a.shift.starts_at} />
                  <span className="min-w-0 flex-1">
                    <span className="text-body text-ink block truncate group-hover:underline group-hover:decoration-hairline group-hover:underline-offset-4">
                      {a.shift.site.name}
                    </span>
                    <span className="text-caption text-stone block">
                      {fmtTime(a.shift.starts_at)} – {fmtTime(a.shift.ends_at)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Europe/London" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function DateMark({ iso }: { iso: string }) {
  const [weekday, day] = fmtShortDay(iso).split(" ");
  return (
    <span className="w-12 shrink-0 text-left">
      <span className="text-h3 text-ink block leading-none">{day}</span>
      <span className="text-micro text-stone mt-1 block">{weekday.replace(",", "")}</span>
    </span>
  );
}

const STATE_LINE: Record<string, string> = {
  "on-duty": "On duty now",
  "can-clock-in": "Ready to clock in",
  "not-yet": "Next shift",
};

function DutyPanel({ a, state, events }: { a: Assignment; state: string; events?: ClockEvent[] }) {
  const clockedIn = state === "on-duty" ? events?.at(-1) : undefined;
  return (
    <section className="on-dark bg-electric-blue text-paper mt-10 px-6 py-8 sm:px-10 sm:py-10" aria-label="Your shift">
      <p className="text-caption text-paper/85">
        {STATE_LINE[state] ?? "Next shift"} · {fmtDay(a.shift.starts_at)}
      </p>
      <p className="text-h2 sm:text-h1 mt-4 tabular-nums leading-none">
        {fmtTime(a.shift.starts_at)}
        <span className="text-paper/60"> – </span>
        {fmtTime(a.shift.ends_at)}
      </p>
      <p className="text-h3 mt-6">{a.shift.site.name}</p>
      {a.shift.site.address && <p className="text-body text-paper/85 mt-1">{a.shift.site.address}</p>}
      {clockedIn && <p className="text-caption text-paper/85 mt-4">Clocked in at {fmtTime(clockedIn.server_time)}</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href={`#/shift/${a.id}`}
          className="text-caption bg-amber text-ink inline-flex min-h-12 items-center px-6 hover:brightness-95"
        >
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
    <li className="py-5">
      <div className="flex items-baseline gap-6">
        <DateMark iso={a.shift.starts_at} />
        <div className="min-w-0 flex-1">
          <a href={`#/shift/${a.id}`} className="text-body text-ink block truncate hover:underline hover:decoration-hairline hover:underline-offset-4">
            {a.shift.site.name}
          </a>
          <p className="text-caption text-stone">
            {fmtTime(a.shift.starts_at)} – {fmtTime(a.shift.ends_at)}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <PortalButton disabled={busy} onClick={() => answer("accepted")}>
              Accept shift
            </PortalButton>
            <PortalButton tone="quiet" disabled={busy} onClick={() => answer("declined")}>
              Decline
            </PortalButton>
          </div>
          {error && (
            <div className="mt-4">
              <Notice kind="error">{error}</Notice>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
