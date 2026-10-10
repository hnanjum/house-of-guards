import { useCallback, useEffect, useState } from "react";
import type { Assignment, ClockEvent, SiteInstruction } from "../../../lib/portalSupabase";
import { fmtDay, fmtDistance, fmtTime, Loading, mapsUrl, Notice, PortalButton } from "../ui";
import { Page, PageHeader, Panel } from "../admin/kit";
import { CLOCK_IN_OPENS_MIN, clock, dutyState, loadAssignment, loadClockEvents, loadInstructions, readPosition, respond, type Position } from "./data";

/**
 * One shift: when and where, the clock in/out control, and the site's
 * instructions. Clocking reads one GPS fix; the database (not the phone)
 * stamps the time and works out the distance to site. If location is
 * unavailable the officer can still clock, and the record is saved
 * without a position so the office can see why.
 */
export default function ShiftDetail({
  assignmentId,
  officerId,
  initial,
  onChanged,
}: {
  assignmentId: string;
  officerId: string;
  initial: Assignment | null;
  onChanged: () => Promise<void>;
}) {
  const [a, setA] = useState<Assignment | null>(initial);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [instructions, setInstructions] = useState<SiteInstruction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const fresh = await loadAssignment(assignmentId);
      if (!fresh) return setError("This shift isn't available to you any more.");
      setA(fresh);
      const [ev, ins] = await Promise.all([loadClockEvents([fresh.id]), loadInstructions(fresh.shift.site.id)]);
      setEvents(ev[fresh.id] ?? []);
      setInstructions(ins);
    } catch {
      setError("This shift couldn't be loaded. Check your connection and try again.");
    }
  }, [assignmentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!a) {
    return (
      <>
        <PageHeader offset={false} title="Shift" />
        <Page>{error ? <Notice kind="error">{error}</Notice> : <Loading label="Loading shift" />}</Page>
      </>
    );
  }

  const { shift } = a;
  const state = a.status === "accepted" ? dutyState(a, events) : null;

  const back = (
    <a href="#/shifts" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
      My shifts
    </a>
  );

  return (
    <>
      <PageHeader
        offset={false}
        title={`${fmtTime(shift.starts_at)} – ${fmtTime(shift.ends_at)}`}
        subtitle={fmtDay(shift.starts_at)}
        actions={back}
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-8">
            <section className="on-dark bg-electric-blue text-paper px-6 py-6 sm:px-8" aria-label="Site">
              <p className="text-caption text-paper/85">Site</p>
              <p className="text-h3 mt-2">{shift.site.name}</p>
              {shift.site.address && <p className="text-caption text-paper/85 mt-1">{shift.site.address}</p>}
              <a
                href={mapsUrl(shift.site)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption border-paper/40 text-paper mt-5 inline-flex min-h-11 items-center border px-5 hover:border-paper"
              >
                Get directions
              </a>
            </section>

            <Panel title={a.status === "offered" ? "Shift offer" : "Attendance"}>
              {a.status === "offered" ? (
                <OfferControls assignmentId={a.id} onDone={async () => { await load(); await onChanged(); }} />
              ) : (
                <ClockPanel
                  state={state!}
                  events={events}
                  opensAt={new Date(Date.parse(shift.starts_at) - CLOCK_IN_OPENS_MIN * 60_000).toISOString()}
                  onClock={async (type, position) => {
                    const ev = await clock(a.id, officerId, type, position);
                    setEvents((prev) => [...prev, ev]);
                    await onChanged();
                    return ev;
                  }}
                />
              )}
            </Panel>

            {shift.notes && (
              <Panel title="Notes for this shift">
                <p className="text-caption text-ink whitespace-pre-line">{shift.notes}</p>
              </Panel>
            )}
          </div>

          <Panel title="Site instructions" flush>
            {instructions === null ? (
              <Loading />
            ) : instructions.length === 0 ? (
              <p className="text-caption text-stone px-6 py-8">No instructions have been added for this site yet.</p>
            ) : (
              <ol className="divide-hairline divide-y">
                {instructions.map((i) => (
                  <li key={i.id} className="px-6 py-5">
                    <h3 className="text-h4 text-ink">{i.title}</h3>
                    {i.body && <p className="text-caption text-ink/80 mt-1.5 whitespace-pre-line">{i.body}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </Page>
    </>
  );
}

function OfferControls({ assignmentId, onDone }: { assignmentId: string; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (status: "accepted" | "declined") => {
    setBusy(true);
    setError(null);
    try {
      await respond(assignmentId, status);
      await onDone();
    } catch {
      setError("That didn't go through. Try again.");
    }
    setBusy(false);
  };
  return (
    <div>
      <p className="text-caption text-ink">The office has offered you this shift.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <PortalButton disabled={busy} onClick={() => answer("accepted")}>
          Accept shift
        </PortalButton>
        <PortalButton tone="quiet" disabled={busy} onClick={() => answer("declined")}>
          Decline
        </PortalButton>
      </div>
      {error && (
        <div className="mt-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}

function ClockPanel({
  state,
  events,
  opensAt,
  onClock,
}: {
  state: ReturnType<typeof dutyState>;
  events: ClockEvent[];
  opensAt: string;
  onClock: (type: "in" | "out", position: Position | null) => Promise<ClockEvent>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [noLocation, setNoLocation] = useState<{ type: "in" | "out"; reason: string } | null>(null);

  const type: "in" | "out" = state === "on-duty" ? "out" : "in";

  async function submit(position: Position | null) {
    setBusy(true);
    try {
      const ev = await onClock(type, position);
      setNoLocation(null);
      const verb = type === "in" ? "Clocked in" : "Clocked out";
      if (ev.within_geofence === false && ev.distance_to_site_m != null) {
        setMessage({
          kind: "info",
          text: `${verb} at ${fmtTime(ev.server_time)}. You appear to be ${fmtDistance(ev.distance_to_site_m)} from the site, so the office will see this flagged.`,
        });
      } else if (ev.within_geofence === null) {
        setMessage({ kind: "info", text: `${verb} at ${fmtTime(ev.server_time)}, without a location.` });
      } else {
        setMessage({ kind: "info", text: `${verb} at ${fmtTime(ev.server_time)}, on site.` });
      }
    } catch {
      setMessage({ kind: "error", text: "That didn't go through. Check your connection and try again." });
    }
    setBusy(false);
  }

  async function start() {
    setBusy(true);
    setMessage(null);
    const { position, reason } = await readPosition();
    setBusy(false);
    if (!position) return setNoLocation({ type, reason: reason ?? "Location unavailable." });
    await submit(position);
  }

  const firstIn = events.find((e) => e.type === "in");
  const lastOut = [...events].reverse().find((e) => e.type === "out");

  return (
    <div>
      <dl className="grid grid-cols-2 gap-6">
        <div>
          <dt className="text-caption text-stone">Clocked in</dt>
          <dd className="text-h3 text-ink mt-1 tabular-nums">{firstIn ? fmtTime(firstIn.server_time) : "—"}</dd>
        </div>
        <div>
          <dt className="text-caption text-stone">Clocked out</dt>
          <dd className="text-h3 text-ink mt-1 tabular-nums">{lastOut ? fmtTime(lastOut.server_time) : "—"}</dd>
        </div>
      </dl>

      <div className="mt-8 space-y-6" aria-live="polite">
        {state === "not-yet" && (
          <p className="text-caption text-stone">Clocking in opens at {fmtTime(opensAt)} on {fmtDay(opensAt)}.</p>
        )}
        {state === "missed" && <p className="text-caption text-stone">This shift has ended without a clock-in. Contact the office.</p>}
        {state === "done" && <p className="text-caption text-ink">Shift complete. Thank you.</p>}

        {(state === "can-clock-in" || state === "on-duty") && !noLocation && (
          <PortalButton className="w-full sm:w-auto sm:min-w-64" disabled={busy} onClick={start}>
            {busy ? "Finding your location" : type === "in" ? "Clock in" : "Clock out"}
          </PortalButton>
        )}

        {noLocation && (
          <div className="space-y-5">
            <Notice kind="error">{noLocation.reason}</Notice>
            <p className="text-caption text-ink">
              You can turn location on and try again, or {noLocation.type === "in" ? "clock in" : "clock out"} without it.
              The office will see that no location was recorded.
            </p>
            <div className="flex flex-wrap gap-3">
              <PortalButton disabled={busy} onClick={start}>
                Try again
              </PortalButton>
              <PortalButton tone="quiet" disabled={busy} onClick={() => submit(null)}>
                {noLocation.type === "in" ? "Clock in without location" : "Clock out without location"}
              </PortalButton>
            </div>
          </div>
        )}

        {message && <Notice kind={message.kind}>{message.text}</Notice>}
      </div>
    </div>
  );
}
