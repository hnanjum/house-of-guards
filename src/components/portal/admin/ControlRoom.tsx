import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { Profile } from "../../../lib/portalSupabase";
import { fmtShortDay, fmtTime, Loading, mapsUrl, Notice, PortalButton } from "../ui";
import { Empty, Page, PageHeader, Panel, Stat, Status } from "./kit";
import {
  acknowledgeAlert,
  ALERT_LABEL,
  escalateAlert,
  listAlerts,
  listClientRequests,
  listOnDuty,
  listSiteContacts,
  REQUEST_KIND,
  resolveAlert,
  updateClientRequest,
  type AlertRow,
  type ClientRequestRow,
  type OnDutyRow,
  type SiteContact,
} from "./opsData";

/**
 * Control room: what needs a human now.
 *  - Open alerts (panic first), live via Supabase Realtime. Each has
 *    Acknowledge (the officer's phone then shows "control saw your
 *    alert"), Call officer, Escalate (with a note), Resolve, and the
 *    site's call list (its contacts, emergency ones first).
 *  - Client requests (extra patrol, expected visitor, access issue) as
 *    tasks to pick up and close with a reply the client sees.
 *  - Officers on duty now with their last welfare check-in and patrol.
 * The dashboard also listens on every page (AdminApp) and shows a banner,
 * plays a tone and raises a browser notification — only while a
 * dashboard is open: someone has to be watching.
 */

const inputClass = "text-body border-ink/50 text-ink mt-2 block min-h-12 w-full border bg-paper px-4 focus:border-electric-blue focus:outline-none";
const tel = (p: string) => `tel:${p.replace(/\s+/g, "")}`;

export default function ControlRoom({ profile, tick }: { profile: Profile; tick: number }) {
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [recent, setRecent] = useState<AlertRow[]>([]);
  const [duty, setDuty] = useState<OnDutyRow[] | null>(null);
  const [requests, setRequests] = useState<ClientRequestRow[]>([]);
  const [contacts, setContacts] = useState<SiteContact[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const since = new Date(Date.now() - 24 * 3600_000).toISOString();
      const [open, all, d, req, c] = await Promise.all([
        listAlerts({ open: true }),
        listAlerts({ sinceIso: since }),
        listOnDuty(),
        listClientRequests(true),
        listSiteContacts(),
      ]);
      setAlerts(open.sort((a, b) => Number(b.kind === "panic") - Number(a.kind === "panic") || b.created_at.localeCompare(a.created_at)));
      setRecent(all.filter((a) => a.resolved_at));
      setDuty(d);
      setRequests(req);
      setContacts(c);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the control room.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load, tick]);

  const panics = alerts?.filter((a) => a.kind === "panic").length ?? 0;

  return (
    <>
      <PageHeader title="Control room" subtitle="Live alerts, client requests and officers on duty" />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-px xl:grid-cols-4">
          <Stat feature label="Open alerts" value={alerts?.length ?? "–"} note={panics ? `${panics} panic` : "No panic alerts"} />
          <Stat label="Not yet seen" value={alerts?.filter((a) => !a.acknowledged_at).length ?? "–"} note="Waiting for acknowledgement" />
          <Stat label="Client requests" value={requests.length} note="Open tasks" />
          <Stat label="On duty now" value={duty?.length ?? "–"} note="Clocked in" />
        </div>

        <Panel title="Open alerts" flush>
          {!alerts ? (
            <Loading />
          ) : alerts.length === 0 ? (
            <Empty>No open alerts.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {alerts.map((a) => (
                <AlertItem key={a.id} a={a} adminId={profile.id} contacts={contacts.filter((c) => c.site_id === a.site_id)} onChanged={load} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Client requests" flush>
          {requests.length === 0 ? (
            <Empty>No open requests from clients.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {requests.map((r) => (
                <RequestItem key={r.id} r={r} adminId={profile.id} onChanged={load} />
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel title="On duty now" flush>
            {!duty ? (
              <Loading />
            ) : duty.length === 0 ? (
              <Empty>Nobody is clocked in.</Empty>
            ) : (
              <ul className="divide-hairline divide-y">
                {duty.map((d) => (
                  <li key={d.assignment_id} className="grid gap-2 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0">
                      <p className="text-caption text-ink">
                        {d.officer_name} · <span className="text-stone">{d.site_name}</span>
                      </p>
                      <p className="text-micro text-stone tabular-nums">
                        On since {fmtTime(d.clocked_in)}
                        {d.officer_phone && (
                          <>
                            {" · "}
                            <a href={tel(d.officer_phone)} className="text-ink underline underline-offset-4">
                              {d.officer_phone}
                            </a>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
                      {d.welfare_interval_min && <Since label="Check-in" at={d.last_welfare ?? d.clocked_in} every={d.welfare_interval_min} none={!d.last_welfare} />}
                      {d.patrol_interval_min && <Since label="Patrol" at={d.last_patrol ?? d.clocked_in} every={d.patrol_interval_min} none={!d.last_patrol} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Resolved in the last 24 hours" flush>
            {recent.length === 0 ? (
              <Empty>Nothing resolved yet.</Empty>
            ) : (
              <ul className="divide-hairline divide-y">
                {recent.slice(0, 20).map((a) => (
                  <li key={a.id} className="px-6 py-3">
                    <p className="text-caption text-ink">
                      {ALERT_LABEL[a.kind]} · {a.officer_name}
                    </p>
                    <p className="text-micro text-stone tabular-nums">
                      {fmtTime(a.created_at)} → {fmtTime(a.resolved_at!)}
                      {a.resolution ? ` · ${a.resolution}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </Page>
    </>
  );
}

function Since({ label, at, every, none }: { label: string; at: string; every: number; none: boolean }) {
  const mins = Math.round((Date.now() - Date.parse(at)) / 60_000);
  const late = mins > every;
  return (
    <Status tone={late ? "bad" : "good"}>
      {label}: {none ? "none yet" : `${mins} min ago`}
      {late ? " · overdue" : ""}
    </Status>
  );
}

function NoteForm({ label, button, placeholder, onSubmit, onCancel, busy }: { label: string; button: string; placeholder: string; onSubmit: (note: string) => void; onCancel: () => void; busy: boolean }) {
  const [note, setNote] = useState("");
  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(note.trim());
      }}
    >
      <label className="min-w-64 flex-1">
        <span className="text-caption text-ink block">{label}</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder={placeholder} />
      </label>
      <PortalButton type="submit" disabled={busy}>
        {button}
      </PortalButton>
      <PortalButton tone="quiet" onClick={onCancel}>
        Cancel
      </PortalButton>
    </form>
  );
}

function AlertItem({ a, adminId, contacts, onChanged }: { a: AlertRow; adminId: string; contacts: SiteContact[]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"resolve" | "escalate" | "calls" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panic = a.kind === "panic";
  const callList = [...contacts].sort((x, y) => Number(y.emergency) - Number(x.emergency) || x.call_order - y.call_order);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setMode(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
    setBusy(false);
  }

  const action = (label: string, onClick: () => void, el?: ReactNode) => el ?? (
    <PortalButton tone="quiet" className="min-h-11" disabled={busy} onClick={onClick}>
      {label}
    </PortalButton>
  );

  return (
    <li className={`px-6 py-5 ${panic ? "border-magenta border-l-4" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={`text-ink ${panic ? "text-h4" : "text-caption"}`}>
            {ALERT_LABEL[a.kind]} · {a.officer_name}
            {a.site_name ? ` at ${a.site_name}` : ""}
          </p>
          <p className="text-micro text-stone mt-1 tabular-nums">
            {fmtShortDay(a.created_at)} {fmtTime(a.created_at)}
            {a.offline && a.device_time ? ` · sent late (pressed ${fmtTime(a.device_time)})` : ""}
            {a.details ? ` · ${a.details}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {a.acknowledged_at && <Status tone="idle">Seen {fmtTime(a.acknowledged_at)}</Status>}
            {a.escalated_at && (
              <Status tone="warn" wrap>
                Escalated {fmtTime(a.escalated_at)}
                {a.escalation_note ? `: ${a.escalation_note}` : ""}
              </Status>
            )}
          </div>
          {a.latitude != null && a.longitude != null && (
            <a
              href={mapsUrl({ latitude: a.latitude, longitude: a.longitude, address: "", name: "" })}
              target="_blank"
              rel="noopener noreferrer"
              className="text-caption text-ink mt-2 inline-block underline underline-offset-4"
            >
              Officer's location{a.accuracy_m ? ` (±${Math.round(a.accuracy_m)} m)` : ""}
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!a.acknowledged_at && (
            <PortalButton className="min-h-11" disabled={busy} onClick={() => run(() => acknowledgeAlert(a.id, adminId))}>
              Acknowledge
            </PortalButton>
          )}
          {a.officer_phone && (
            <a href={tel(a.officer_phone)} className="text-caption border-ink/20 text-ink inline-flex min-h-11 items-center border px-5 hover:border-ink">
              Call officer
            </a>
          )}
          {action("Call list", () => setMode(mode === "calls" ? null : "calls"))}
          {!a.escalated_at && action("Escalate", () => setMode("escalate"))}
          {action("Resolve", () => setMode("resolve"))}
        </div>
      </div>

      {mode === "calls" && (
        <div className="border-hairline mt-4 border p-4">
          {callList.length === 0 ? (
            <p className="text-caption text-stone">
              No contacts for this site.{" "}
              {a.site_id && (
                <a href={`#/sites/${a.site_id}/contacts`} className="text-ink underline underline-offset-4">
                  Add them
                </a>
              )}
            </p>
          ) : (
            <ol className="space-y-2">
              {callList.map((c, i) => (
                <li key={c.id} className="text-caption text-ink flex flex-wrap items-baseline gap-x-3">
                  <span className="text-stone tabular-nums">{i + 1}.</span>
                  <span>
                    {c.name}
                    {c.role ? `, ${c.role}` : ""}
                    {c.emergency ? " · emergency" : ""}
                  </span>
                  {c.phone && (
                    <a href={tel(c.phone)} className="underline underline-offset-4">
                      {c.phone}
                    </a>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {mode === "escalate" && (
        <NoteForm
          label="Escalated to whom, and why"
          button="Escalate"
          placeholder="e.g. Police called (ref 123), duty manager informed"
          busy={busy}
          onCancel={() => setMode(null)}
          onSubmit={(note) => run(() => escalateAlert(a.id, adminId, note))}
        />
      )}
      {mode === "resolve" && (
        <NoteForm
          label="What happened (shown to the officer)"
          button="Resolve alert"
          placeholder="e.g. Spoke to officer, all fine"
          busy={busy}
          onCancel={() => setMode(null)}
          onSubmit={(note) => run(() => resolveAlert(a.id, adminId, note))}
        />
      )}
      {error && (
        <div className="mt-3">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
    </li>
  );
}

function RequestItem({ r, adminId, onChanged }: { r: ClientRequestRow; adminId: string; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<"done" | "declined" | null>(null);

  async function set(status: ClientRequestRow["status"], response: string | null) {
    setBusy(true);
    try {
      await updateClientRequest(r.id, adminId, status, response);
      setClosing(null);
      await onChanged();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't update.");
    }
    setBusy(false);
  }

  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption text-ink">
            {REQUEST_KIND[r.kind]} · {r.client_name}
            {r.site_name ? `, ${r.site_name}` : ""}
          </p>
          <p className="text-caption text-ink mt-1 whitespace-pre-line break-words">{r.details}</p>
          <p className="text-micro text-stone mt-1 tabular-nums">
            From {r.requested_by} · {fmtShortDay(r.created_at)} {fmtTime(r.created_at)}
            {r.wanted_at ? ` · wanted ${fmtShortDay(r.wanted_at)} ${fmtTime(r.wanted_at)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {r.status === "open" ? (
            <PortalButton className="min-h-11" disabled={busy} onClick={() => set("in_progress", r.response)}>
              Take it
            </PortalButton>
          ) : (
            <Status tone="warn">In progress</Status>
          )}
          <PortalButton tone="quiet" className="min-h-11" disabled={busy} onClick={() => setClosing("done")}>
            Done
          </PortalButton>
          <PortalButton tone="quiet" className="min-h-11" disabled={busy} onClick={() => setClosing("declined")}>
            Decline
          </PortalButton>
        </div>
      </div>
      {closing && (
        <NoteForm
          label="Reply to the client"
          button={closing === "done" ? "Mark done" : "Decline"}
          placeholder={closing === "done" ? "e.g. Extra patrol added at 22:00" : "e.g. Not possible tonight, we'll call you"}
          busy={busy}
          onCancel={() => setClosing(null)}
          onSubmit={(note) => set(closing, note || null)}
        />
      )}
    </li>
  );
}
