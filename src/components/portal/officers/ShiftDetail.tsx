import { useCallback, useEffect, useState } from "react";
import type { Assignment, ClockEvent, InstructionCategory, SiteInstruction } from "../../../lib/portalSupabase";
import { fmtDay, fmtDistance, fmtShortDay, fmtTime, Loading, mapsUrl, Notice, PortalButton } from "../ui";
import { Page, PageHeader, Panel, Status } from "../admin/kit";
import { CLOCK_IN_OPENS_MIN, clock, dutyState, loadAssignment, loadClockEvents, loadInstructions, punctuality, readPosition, respond, type Position } from "./data";
import { loadChecklists, loadLog, loadSubmissions, type Checklist, type LogEntry } from "./ops";
import { signedUrl } from "./media";
import { SelfieCapture, Tabs } from "./widgets";
import { WelfarePanel } from "./Welfare";
import Patrol from "./Patrol";
import OccurrenceLog from "./OccurrenceLog";
import Checklists from "./Checklists";

/**
 * One shift. An accepted shift has five tabs:
 *   Overview   — site, contact, clock in/out (GPS + selfie), welfare
 *                check-ins, the last handover, shift notes
 *   Patrol     — QR checkpoint rounds
 *   Log        — the site's occurrence book: notes, handovers, visitors,
 *                vehicles, keys
 *   Checklists — equipment and site checks
 *   Site info  — post orders, emergency contacts, fire procedures, plans
 * Clocking reads one GPS fix; the database (not the phone) stamps the
 * time, distance to site and minutes late/early.
 */

export type ShiftTab = "overview" | "patrol" | "log" | "checks" | "site";

export default function ShiftDetail({
  assignmentId,
  officerId,
  tab,
  sub,
  initial,
  onChanged,
}: {
  assignmentId: string;
  officerId: string;
  tab: ShiftTab;
  /** Third route segment, e.g. a checklist id. */
  sub?: string;
  initial: Assignment | null;
  onChanged: () => Promise<void>;
}) {
  const [a, setA] = useState<Assignment | null>(initial);
  const [events, setEvents] = useState<ClockEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const fresh = await loadAssignment(assignmentId);
      if (!fresh) return setError("This shift isn't available to you any more.");
      setA(fresh);
      const ev = await loadClockEvents([fresh.id]);
      setEvents(ev[fresh.id] ?? []);
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
  const base = `#/shift/${a.id}`;
  const back = (
    <a href="#/shifts" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
      My shifts
    </a>
  );

  return (
    <>
      <PageHeader offset={false} title={`${fmtTime(shift.starts_at)} – ${fmtTime(shift.ends_at)}`} subtitle={`${fmtDay(shift.starts_at)} · ${shift.site.name}`} actions={back} />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {a.status === "accepted" && (
          <Tabs
            active={tab}
            items={[
              { key: "overview", href: base, label: "Overview" },
              { key: "patrol", href: `${base}/patrol`, label: "Patrol" },
              { key: "log", href: `${base}/log`, label: "Log" },
              { key: "checks", href: `${base}/checks`, label: "Checklists" },
              { key: "site", href: `${base}/site`, label: "Site info" },
            ]}
          />
        )}

        {a.status !== "accepted" || tab === "overview" ? (
          <Overview
            a={a}
            officerId={officerId}
            events={events}
            state={state}
            onClocked={async (ev) => {
              if (ev) setEvents((prev) => [...prev, ev]);
              else setEvents((await loadClockEvents([a.id]))[a.id] ?? []);
              await onChanged();
            }}
            onResponded={async () => {
              await load();
              await onChanged();
            }}
          />
        ) : tab === "patrol" ? (
          <Patrol a={a} onDuty={state === "on-duty"} />
        ) : tab === "log" ? (
          <OccurrenceLog a={a} officerId={officerId} onDuty={state === "on-duty" || state === "can-clock-in"} />
        ) : tab === "checks" ? (
          <Checklists a={a} officerId={officerId} openId={sub} />
        ) : (
          <SiteInfo siteId={shift.site.id} />
        )}
      </Page>
    </>
  );
}

function Overview({
  a,
  officerId,
  events,
  state,
  onClocked,
  onResponded,
}: {
  a: Assignment;
  officerId: string;
  events: ClockEvent[];
  state: ReturnType<typeof dutyState> | null;
  onClocked: (ev: ClockEvent | null) => Promise<void>;
  onResponded: () => Promise<void>;
}) {
  const { shift } = a;
  const site = shift.site;
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        <section className="on-dark bg-electric-blue text-paper px-6 py-6 sm:px-8" aria-label="Site">
          <p className="text-caption text-paper/85">Site</p>
          <p className="text-h3 mt-2">{site.name}</p>
          {site.address && <p className="text-caption text-paper/85 mt-1">{site.address}</p>}
          {(site.contact_name || site.contact_phone) && (
            <p className="text-caption mt-4">
              Site contact: {site.contact_name ?? ""}
              {site.contact_phone && (
                <>
                  {site.contact_name ? ", " : ""}
                  <a href={`tel:${site.contact_phone.replace(/\s+/g, "")}`} className="underline underline-offset-4">
                    {site.contact_phone}
                  </a>
                </>
              )}
            </p>
          )}
          <a
            href={mapsUrl(site)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-caption border-paper/40 text-paper mt-5 inline-flex min-h-11 items-center border px-5 hover:border-paper"
          >
            Get directions
          </a>
        </section>

        <Panel title={a.status === "offered" ? "Shift offer" : "Attendance"}>
          {a.status === "offered" ? (
            <OfferControls assignmentId={a.id} onDone={onResponded} />
          ) : (
            <ClockPanel
              a={a}
              officerId={officerId}
              state={state!}
              events={events}
              opensAt={new Date(Date.parse(shift.starts_at) - CLOCK_IN_OPENS_MIN * 60_000).toISOString()}
              onClocked={onClocked}
            />
          )}
        </Panel>

        {state === "on-duty" && site.welfare_interval_min && (
          <WelfarePanel a={a} officerId={officerId} clockedInAt={events.filter((e) => e.type === "in").at(-1)!.server_time} />
        )}
      </div>

      <div className="space-y-8">
        {a.status === "accepted" && <Handover a={a} />}
        {shift.notes && (
          <Panel title="Notes for this shift">
            <p className="text-caption text-ink whitespace-pre-line">{shift.notes}</p>
          </Panel>
        )}
        {a.status === "accepted" && (
          <Panel title="During this shift">
            <ul className="text-caption text-ink space-y-2">
              {site.patrol_interval_min && <li>Patrol every {site.patrol_interval_min} minutes, scanning each checkpoint in order.</li>}
              {site.welfare_interval_min && <li>Welfare check-in every {site.welfare_interval_min} minutes. Control is alerted if one is missed.</li>}
              <li>Record visitors, vehicles, keys and anything notable in the log.</li>
              <li>Write a handover note before you clock out.</li>
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Handover({ a }: { a: Assignment }) {
  const [notes, setNotes] = useState<LogEntry[] | null>(null);
  useEffect(() => {
    loadLog(a.shift.site.id, 2)
      .then((l) => setNotes(l.filter((e) => e.kind === "handover").slice(0, 3)))
      .catch(() => setNotes([]));
  }, [a.shift.site.id]);
  if (!notes || notes.length === 0) return null;
  return (
    <Panel title="Latest handover" action={<a href={`#/shift/${a.id}/log`} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">Log</a>} flush>
      <ol className="divide-hairline divide-y">
        {notes.map((n) => (
          <li key={n.id} className="px-6 py-4">
            <p className="text-micro text-stone tabular-nums">
              {fmtShortDay(n.occurred_at)} {fmtTime(n.occurred_at)} · {n.author_name ?? "Officer"}
            </p>
            <p className="text-caption text-ink mt-1 whitespace-pre-line">{n.body}</p>
          </li>
        ))}
      </ol>
    </Panel>
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
  a,
  officerId,
  state,
  events,
  opensAt,
  onClocked,
}: {
  a: Assignment;
  officerId: string;
  state: ReturnType<typeof dutyState>;
  events: ClockEvent[];
  opensAt: string;
  onClocked: (ev: ClockEvent | null) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [noLocation, setNoLocation] = useState<{ reason: string } | null>(null);
  const [selfie, setSelfie] = useState<Blob | null>(null);
  const [skipSelfie, setSkipSelfie] = useState(false);
  const [prompts, setPrompts] = useState<Checklist[]>([]);

  const type: "in" | "out" = state === "on-duty" ? "out" : "in";
  const site = a.shift.site;
  const needSelfie = site.selfie_required && !skipSelfie;
  const canClock = state === "can-clock-in" || state === "on-duty";

  async function submit(position: Position | null) {
    setBusy(true);
    try {
      const ev = await clock(a.id, officerId, type, position, selfie, `Clock ${type} · ${site.name}`);
      setNoLocation(null);
      setSelfie(null);
      const verb = type === "in" ? "Clocked in" : "Clocked out";
      if (!ev) {
        setMessage({ kind: "info", text: `${verb}. No signal, so it's saved on this phone and will be sent automatically.` });
      } else {
        const parts = [`${verb} at ${fmtTime(ev.server_time)}`];
        if (ev.within_geofence === false && ev.distance_to_site_m != null) parts.push(`${fmtDistance(ev.distance_to_site_m)} from the site, so the office will see this flagged`);
        else if (ev.within_geofence === null) parts.push("without a location");
        else parts.push("on site");
        const p = punctuality(ev);
        if (p) parts.push(p);
        setMessage({ kind: "info", text: parts.join(", ") + "." });
      }
      await onClocked(ev);
      // Prompt the checklists that belong to this moment.
      const lists = await loadChecklists(site.id).catch(() => [] as Checklist[]);
      const done = await loadSubmissions(a.id).catch(() => []);
      setPrompts(lists.filter((l) => l.prompt_at === (type === "in" ? "clock_in" : "clock_out") && !done.some((d) => d.checklist_id === l.id)));
    } catch {
      setMessage({ kind: "error", text: "That didn't go through. Try again." });
    }
    setBusy(false);
  }

  async function start() {
    setBusy(true);
    setMessage(null);
    const { position, reason } = await readPosition();
    setBusy(false);
    if (!position) return setNoLocation({ reason: reason ?? "Location unavailable." });
    await submit(position);
  }

  const firstIn = events.find((e) => e.type === "in");
  const lastOut = [...events].reverse().find((e) => e.type === "out");

  return (
    <div>
      <dl className="grid grid-cols-2 gap-6">
        {[
          ["Clocked in", firstIn],
          ["Clocked out", lastOut],
        ].map(([label, e]) => {
          const ev = e as ClockEvent | undefined;
          const p = ev && punctuality(ev);
          return (
            <div key={label as string}>
              <dt className="text-caption text-stone">{label as string}</dt>
              <dd className="text-h3 text-ink mt-1 tabular-nums">{ev ? fmtTime(ev.server_time) : "—"}</dd>
              {ev?.pending && <dd className="text-micro text-stone mt-1">Waiting for signal</dd>}
              {p && (
                <dd className="mt-1">
                  <Status tone="warn">{p}</Status>
                </dd>
              )}
            </div>
          );
        })}
      </dl>

      <div className="mt-8 space-y-6" aria-live="polite">
        {state === "not-yet" && <p className="text-caption text-stone">Clocking in opens at {fmtTime(opensAt)} on {fmtDay(opensAt)}.</p>}
        {state === "missed" && <p className="text-caption text-stone">This shift has ended without a clock-in. Contact the office.</p>}
        {state === "done" && <p className="text-caption text-ink">Shift complete. Thank you.</p>}

        {canClock && !noLocation && (
          <>
            {needSelfie && <SelfieCapture value={selfie} onChange={setSelfie} label={type === "in" ? "Take clock-in selfie" : "Take clock-out selfie"} />}
            <div className="flex flex-wrap items-center gap-4">
              <PortalButton className="w-full sm:w-auto sm:min-w-64" disabled={busy || (needSelfie && !selfie)} onClick={start}>
                {busy ? "Finding your location" : type === "in" ? "Clock in" : "Clock out"}
              </PortalButton>
              {needSelfie && !selfie && (
                <button type="button" onClick={() => setSkipSelfie(true)} className="text-caption text-stone underline decoration-hairline underline-offset-4 hover:text-ink">
                  Camera not working?
                </button>
              )}
            </div>
            {skipSelfie && site.selfie_required && <p className="text-micro text-stone">Clocking without a photo. The office will see that no selfie was taken.</p>}
          </>
        )}

        {noLocation && (
          <div className="space-y-5">
            <Notice kind="error">{noLocation.reason}</Notice>
            <p className="text-caption text-ink">
              You can turn location on and try again, or {type === "in" ? "clock in" : "clock out"} without it. The office will see that no location was recorded.
            </p>
            <div className="flex flex-wrap gap-3">
              <PortalButton disabled={busy} onClick={start}>
                Try again
              </PortalButton>
              <PortalButton tone="quiet" disabled={busy} onClick={() => submit(null)}>
                {type === "in" ? "Clock in without location" : "Clock out without location"}
              </PortalButton>
            </div>
          </div>
        )}

        {message && <Notice kind={message.kind}>{message.text}</Notice>}
        {prompts.length > 0 && (
          <div className="border-hairline border p-4">
            <p className="text-caption text-ink">{type === "in" ? "Before you start:" : "Before you leave:"}</p>
            <ul className="mt-2 space-y-1">
              {prompts.map((p) => (
                <li key={p.id}>
                  <a href={`#/shift/${a.id}/checks/${p.id}`} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                    {p.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- site info ---------- */

const CATEGORY: { key: InstructionCategory; title: string }[] = [
  { key: "post_orders", title: "Post orders" },
  { key: "emergency", title: "Emergency contacts" },
  { key: "fire", title: "Fire procedures" },
  { key: "access", title: "Access and keys" },
  { key: "general", title: "General" },
];

function SiteInfo({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<SiteInstruction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadInstructions(siteId)
      .then(setItems)
      .catch(() => setError("Site instructions couldn't be loaded."));
  }, [siteId]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!items) return <Loading />;
  if (items.length === 0) return <Panel><p className="text-caption text-stone">No instructions have been added for this site yet.</p></Panel>;

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      {CATEGORY.filter((c) => items.some((i) => (i.category ?? "general") === c.key)).map((c) => (
        <Panel key={c.key} title={c.title} flush>
          <ol className="divide-hairline divide-y">
            {items
              .filter((i) => (i.category ?? "general") === c.key)
              .map((i) => (
                <li key={i.id} className="px-6 py-5">
                  <h3 className="text-h4 text-ink">{i.title}</h3>
                  {i.body && <Body category={c.key} text={i.body} />}
                  {i.file_path && <FileLink path={i.file_path} name={i.file_name ?? "Attachment"} />}
                </li>
              ))}
          </ol>
        </Panel>
      ))}
    </div>
  );
}

/** Phone numbers in emergency contacts become tap-to-call links. */
function Body({ category, text }: { category: InstructionCategory; text: string }) {
  if (category !== "emergency") return <p className="text-caption text-ink/80 mt-1.5 whitespace-pre-line">{text}</p>;
  const parts = text.split(/(\+?\d[\d\s]{6,}\d)/g);
  return (
    <p className="text-caption text-ink/80 mt-1.5 whitespace-pre-line">
      {parts.map((p, i) =>
        /^\+?\d[\d\s]{6,}\d$/.test(p) ? (
          <a key={i} href={`tel:${p.replace(/\s+/g, "")}`} className="text-ink underline underline-offset-4">
            {p}
          </a>
        ) : (
          p
        ),
      )}
    </p>
  );
}

function FileLink({ path, name }: { path: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        const url = await signedUrl("site-files", path, 600);
        setBusy(false);
        if (url) window.open(url, "_blank", "noopener");
        else setFailed(true);
      }}
      className="text-caption text-ink mt-3 inline-flex min-h-11 items-center border border-ink/20 px-4 hover:border-ink"
    >
      {busy ? "Opening" : failed ? "Couldn't open — needs signal" : `Open ${name}`}
    </button>
  );
}
