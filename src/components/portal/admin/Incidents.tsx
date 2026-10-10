import { useCallback, useEffect, useState } from "react";
import type { Profile } from "../../../lib/portalSupabase";
import { fmtDay, fmtShortDay, fmtTime, Loading, mapsUrl, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { addDays, listSites, startOfToday, type SiteRow } from "./adminData";
import { Empty, Page, PageHeader, Panel, Status, Table, td } from "./kit";
import {
  addIncidentNote,
  listAdmins,
  listAudit,
  listClientPhotos,
  listIncidentNotes,
  listIncidents,
  releasePhoto,
  signed,
  updateIncident,
  withdrawPhoto,
  type AuditRow,
  type ClientPhoto,
  type IncidentNote,
  type IncidentRow,
} from "./opsData";
import { categoryLabel } from "../officers/ops";
import { Segmented } from "../officers/widgets";

/**
 * Incident reports from officers.
 * LIST — filter by status, severity, site and period.
 * DETAIL — the officer's report (never editable), location, photos and
 * video; a timeline (reported, every status/assignment/share change from
 * the audit log, and notes); notes (internal by default, or visible to
 * the client); assign to a member of the office; close; and SHARE WITH
 * CLIENT — with a client summary and a choice of photos. Shared photos
 * are re-drawn copies with all metadata (incl. GPS) removed; video and
 * internal notes are never shared. "Preview as client" shows exactly
 * the client's view.
 */

const SEV_TONE: Record<string, "bad" | "warn" | "idle"> = { critical: "bad", high: "bad", medium: "warn", low: "idle" };
const STATUS_LABEL = { open: "Open", reviewing: "Reviewing", closed: "Closed" } as const;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export default function Incidents({ profile, selectedId, tick }: { profile: Profile; selectedId?: string; tick: number }) {
  const [days, setDays] = useState<"7" | "30" | "90" | "365">("30");
  const [status, setStatus] = useState<"open" | "all">("open");
  const [severity, setSeverity] = useState("");
  const [site, setSite] = useState("");
  const [rows, setRows] = useState<IncidentRow[] | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, s] = await Promise.all([listIncidents(addDays(startOfToday(), -Number(days)).toISOString()), listSites()]);
      setRows(r);
      setSites(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load incidents.");
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load, tick]);

  const selected = rows?.find((r) => r.id === selectedId);
  if (selectedId && selected) return <Detail r={selected} adminId={profile.id} onSaved={load} />;

  const shown =
    rows?.filter((r) => (status === "all" || r.status !== "closed") && (!severity || r.severity === severity) && (!site || r.site_id === site)) ?? [];

  return (
    <>
      <PageHeader
        title="Incidents"
        subtitle={rows ? `${rows.filter((r) => r.status !== "closed").length} not closed` : undefined}
        actions={
          <Segmented
            label="Period"
            value={days}
            onChange={setDays}
            options={[
              { value: "7", label: "7 days" },
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "365", label: "Year" },
            ]}
          />
        }
      />
      <Page>
        <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
          <SelectField label="Status" id="if-status" value={status} onChange={(e) => setStatus(e.target.value as "open" | "all")}>
            <option value="open">Not closed</option>
            <option value="all">All</option>
          </SelectField>
          <SelectField label="Severity" id="if-sev" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Any</option>
            {["critical", "high", "medium", "low"].map((s) => (
              <option key={s} value={s}>
                {cap(s)}
              </option>
            ))}
          </SelectField>
          <SelectField label="Site" id="if-site" value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!rows ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty>No incidents match.</Empty>
          ) : (
            <Table head={["When", "Incident", "Site", "Officer", "Severity", "Status"]}>
              {shown.map((r) => (
                <tr key={r.id} className="hover:bg-surface-alt">
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {fmtShortDay(r.occurred_at)} · {fmtTime(r.occurred_at)}
                  </td>
                  <td className={td}>
                    <a href={`#/incidents/${r.id}`} className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                      {r.title}
                    </a>
                    <span className="text-micro text-stone block">
                      {categoryLabel(r.category)}
                      {r.media.length ? ` · ${r.media.length} file${r.media.length === 1 ? "" : "s"}` : ""}
                      {r.shared_with_client ? " · shared with client" : ""}
                    </span>
                  </td>
                  <td className={td}>{r.site_name}</td>
                  <td className={td}>{r.officer_name}</td>
                  <td className={td}>
                    <Status tone={SEV_TONE[r.severity] ?? "idle"}>{cap(r.severity)}</Status>
                  </td>
                  <td className={td}>
                    <Status tone={r.status === "closed" ? "good" : "warn"}>{STATUS_LABEL[r.status]}</Status>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </Page>
    </>
  );
}

function Detail({ r, adminId, onSaved }: { r: IncidentRow; adminId: string; onSaved: () => Promise<void> }) {
  const [media, setMedia] = useState<{ url: string | null; mime: string; id: string; path: string }[]>([]);
  const [notes, setNotes] = useState<IncidentNote[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [admins, setAdmins] = useState<{ id: string; name: string }[]>([]);
  const [released, setReleased] = useState<ClientPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [noteForClient, setNoteForClient] = useState(false);
  const [summary, setSummary] = useState(r.client_summary ?? "");

  const loadSide = useCallback(async () => {
    const [n, a, ad, rel] = await Promise.all([
      listIncidentNotes(r.id),
      listAudit({ fromIso: new Date(Date.parse(r.server_time) - 60_000).toISOString(), toIso: new Date(Date.now() + 60_000).toISOString(), entity: "incidents", entityId: r.id }),
      listAdmins(),
      listClientPhotos(r.id),
    ]);
    setNotes(n);
    setAudit(a);
    setAdmins(ad);
    setReleased(rel);
  }, [r.id, r.server_time]);

  useEffect(() => {
    loadSide().catch(() => {});
    Promise.all(r.media.map(async (m) => ({ id: m.id, mime: m.mime, path: m.path, url: await signed("incident-media", m.path, 1800) }))).then(setMedia);
  }, [r.media, loadSide]);

  async function run(fn: () => Promise<void>, okText?: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await Promise.all([onSaved(), loadSide()]);
      if (okText) setMsg({ kind: "info", text: okText });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "That didn't work." });
    }
    setBusy(false);
  }

  const stamp = { reviewed_by: adminId, reviewed_at: new Date().toISOString() };

  // Timeline: reported, audited changes (status/assignment/sharing), notes.
  const describe = (a: AuditRow) => {
    const c = (a.changes ?? {}) as Record<string, { to: unknown }>;
    const parts: string[] = [];
    if (c.status) parts.push(`status → ${String(c.status.to)}`);
    if (c.assigned_to) parts.push(c.assigned_to.to ? `assigned to ${admins.find((x) => x.id === c.assigned_to.to)?.name ?? "a colleague"}` : "unassigned");
    if (c.shared_with_client) parts.push(c.shared_with_client.to ? "shared with client" : "withdrawn from client");
    if (c.client_summary) parts.push("client summary updated");
    return parts.join(", ");
  };
  const timeline = [
    { at: r.server_time, who: r.officer_name, text: `Reported${r.offline ? " (sent late, no signal)" : ""}`, client: false },
    ...audit.filter((a) => a.action === "update" && describe(a)).map((a) => ({ at: a.at, who: a.actor_name ?? "Office", text: describe(a), client: false })),
    ...notes.map((n) => ({ at: n.created_at, who: n.author_name ?? "Office", text: n.body, client: n.client_visible })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const images = media.filter((m) => m.mime.startsWith("image/"));

  return (
    <>
      <PageHeader
        title={r.title}
        subtitle={`${categoryLabel(r.category)} · ${r.site_name}`}
        actions={
          <>
            <button type="button" onClick={() => window.print()} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
              Print
            </button>
            <a href="#/incidents" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
              All incidents
            </a>
          </>
        }
      />
      <Page>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-8">
            <Panel title="Report">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {[
                  ["Happened", `${fmtDay(r.occurred_at)}, ${fmtTime(r.occurred_at)}`],
                  ["Reported", `${fmtDay(r.server_time)}, ${fmtTime(r.server_time)}`],
                  ["Officer", r.officer_name],
                  ["Severity", cap(r.severity)],
                  ["Police reference", r.police_ref ?? "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-caption text-stone">{k}</dt>
                    <dd className="text-caption text-ink mt-0.5">{v}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-caption text-stone">Location</dt>
                  <dd className="text-caption text-ink mt-0.5">
                    {r.latitude != null && r.longitude != null ? (
                      <a href={mapsUrl({ latitude: r.latitude, longitude: r.longitude, name: "", address: "" })} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                        View on map
                      </a>
                    ) : (
                      "Not recorded"
                    )}
                  </dd>
                </div>
              </dl>
              <h3 className="text-h4 text-ink mt-8">What happened</h3>
              <p className="text-caption text-ink mt-2 whitespace-pre-line break-words">{r.description}</p>
              {r.people && (
                <>
                  <h3 className="text-h4 text-ink mt-6">People involved (internal)</h3>
                  <p className="text-caption text-ink mt-2 whitespace-pre-line break-words">{r.people}</p>
                </>
              )}
            </Panel>

            {media.length > 0 && (
              <Panel title="Photos and video">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {media.map((m) =>
                    !m.url ? (
                      <div key={m.id} className="bg-surface-alt text-micro text-stone flex aspect-square items-center justify-center p-3">
                        Couldn't load
                      </div>
                    ) : m.mime.startsWith("video/") ? (
                      <video key={m.id} src={m.url} controls className="bg-ink aspect-square w-full object-contain" />
                    ) : (
                      <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={m.url} alt="Incident evidence" className="bg-surface-alt aspect-square w-full object-cover" />
                      </a>
                    ),
                  )}
                </div>
                <p className="text-micro text-stone mt-3">Private links expire after 30 minutes. Reopen the report to refresh them.</p>
              </Panel>
            )}

            <Panel title="Timeline" flush>
              <ol className="divide-hairline divide-y">
                {timeline.map((t, i) => (
                  <li key={i} className="grid gap-1 px-6 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
                    <span className="text-micro text-stone tabular-nums">
                      {fmtShortDay(t.at)} {fmtTime(t.at)}
                    </span>
                    <span className="text-caption text-ink min-w-0 break-words whitespace-pre-line">
                      {t.text}
                      <span className="text-micro text-stone block">
                        {t.who}
                        {t.client ? " · visible to client" : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
              <form
                className="border-hairline space-y-3 border-t p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (note.trim())
                    run(async () => {
                      await addIncidentNote(r.id, adminId, note.trim(), noteForClient);
                      setNote("");
                      setNoteForClient(false);
                    });
                }}
              >
                <TextArea label="Add a note" id="inc-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                <label className="text-caption text-ink flex items-center gap-3">
                  <input type="checkbox" checked={noteForClient} onChange={(e) => setNoteForClient(e.target.checked)} className="accent-electric-blue size-5" />
                  Show this note to the client (if the incident is shared)
                </label>
                <PortalButton type="submit" disabled={busy || !note.trim()}>
                  Add note
                </PortalButton>
              </form>
            </Panel>
          </div>

          <div className="space-y-8">
            <Panel title="Handling">
              <div className="space-y-4">
                <SelectField
                  label="Status"
                  id="inc-status"
                  value={r.status}
                  onChange={(e) => run(() => updateIncident(r.id, { status: e.target.value, ...stamp }), "Status updated.")}
                >
                  <option value="open">Open</option>
                  <option value="reviewing">Reviewing</option>
                  <option value="closed">Closed</option>
                </SelectField>
                <SelectField
                  label="Assigned to"
                  id="inc-assign"
                  value={r.assigned_to ?? ""}
                  onChange={(e) => run(() => updateIncident(r.id, { assigned_to: e.target.value || null, ...stamp }), "Assignment updated.")}
                >
                  <option value="">Nobody</option>
                  {admins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.id === adminId ? " (you)" : ""}
                    </option>
                  ))}
                </SelectField>
                {r.status !== "closed" && (
                  <PortalButton disabled={busy} onClick={() => run(() => updateIncident(r.id, { status: "closed", ...stamp }), "Incident closed.")}>
                    Close incident
                  </PortalButton>
                )}
              </div>
            </Panel>

            <Panel title="Share with client">
              <p className="text-caption text-ink">
                {r.shared_with_client ? `Shared with the client${r.shared_at ? ` on ${fmtShortDay(r.shared_at)}` : ""}.` : "Not shared. The client can't see this incident."}
              </p>
              <p className="text-micro text-stone mt-1">
                The client sees: title, type, severity, site, time, description, your client summary, released photos and client-visible notes — plus the officer as first name and last initial, and the location, only if those are switched on for this client. Never internal notes, people involved or video.
              </p>
              <div className="mt-4">
                <TextArea label="Client summary (optional)" id="inc-summary" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} />
              </div>
              {images.length > 0 && (
                <div className="mt-5">
                  <p className="text-caption text-ink">Photos for the client</p>
                  <div className="mt-2 grid grid-cols-3 gap-3">
                    {images.map((m) => {
                      const rel = released.find((p) => p.source_id === m.id);
                      return (
                        <div key={m.id} className="space-y-1">
                          {m.url && <img src={m.url} alt="" className={`bg-surface-alt aspect-square w-full object-cover ${rel ? "" : "opacity-60"}`} />}
                          <button
                            type="button"
                            disabled={busy}
                            className="text-micro text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
                            onClick={() => run(() => (rel ? withdrawPhoto(rel) : releasePhoto(r.id, m)))}
                          >
                            {rel ? "Released · withdraw" : "Release (metadata removed)"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <PortalButton
                  disabled={busy}
                  onClick={() =>
                    run(
                      () =>
                        updateIncident(r.id, {
                          client_summary: summary.trim() || null,
                          shared_with_client: true,
                          shared_at: r.shared_at ?? new Date().toISOString(),
                        }),
                      r.shared_with_client ? "Saved." : "Shared with the client.",
                    )
                  }
                >
                  {r.shared_with_client ? "Save" : "Share with client"}
                </PortalButton>
                {r.shared_with_client && (
                  <PortalButton tone="quiet" disabled={busy} onClick={() => run(() => updateIncident(r.id, { shared_with_client: false }), "Withdrawn from the client.")}>
                    Withdraw
                  </PortalButton>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}
