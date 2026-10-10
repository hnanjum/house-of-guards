import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import type { Profile } from "../../../lib/portalSupabase";
import { Field, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { addDays, isoDate, listClients, listShifts, listSites, startOfToday, ukToInstant, type Client, type SiteRow } from "./adminData";
import { Empty, Page, PageHeader, Panel, Status } from "./kit";
import {
  draftDailyReport,
  listDailyReports,
  listIncidents,
  listMonthlyReports,
  listPatrolDayNotes,
  listPatrols,
  saveDailyReport,
  saveMonthlyReport,
  savePatrolDayNote,
  setPatrolClientNote,
  type DailyReport,
  type MonthlyReport,
  type PatrolDayNote,
  type PatrolReport,
} from "./opsData";
import { Tabs } from "../officers/widgets";

/**
 * What clients see is decided here. Nothing reaches a client unless it
 * is approved or released:
 *  - DAILY SUMMARIES per site per day: drafted from the occurrence book,
 *    patrols and incidents, edited, then approved.
 *  - PATROL REVIEW: incomplete patrols are hidden from the client unless
 *    you add a note and release it; the same for a day's shortfall.
 *  - MONTHLY REPORTS per client: figures generated for the month, a
 *    written summary, then approved. The client prints/saves it as PDF.
 */

type Tab = "daily" | "patrols" | "monthly";

export default function ClientReports({ profile, tab }: { profile: Profile; tab?: string }) {
  const t: Tab = tab === "patrols" || tab === "monthly" ? tab : "daily";
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  useEffect(() => {
    Promise.all([listSites(), listClients()]).then(([s, c]) => {
      setSites(s.filter((x) => x.active && x.client_id));
      setClients(c);
    });
  }, []);
  return (
    <>
      <PageHeader title="Client reports" subtitle="Approve what each client can see" />
      <Page>
        <Tabs
          active={t}
          items={[
            { key: "daily", href: "#/reports", label: "Daily summaries" },
            { key: "patrols", href: "#/reports/patrols", label: "Patrol review" },
            { key: "monthly", href: "#/reports/monthly", label: "Monthly reports" },
          ]}
        />
        {sites.length === 0 && t !== "monthly" ? (
          <Panel>
            <p className="text-caption text-stone">No active sites are linked to a client yet. Link a site to a client in its details.</p>
          </Panel>
        ) : t === "daily" ? (
          <Daily sites={sites} adminId={profile.id} />
        ) : t === "patrols" ? (
          <PatrolReview sites={sites} />
        ) : (
          <Monthly clients={clients} sites={sites} adminId={profile.id} />
        )}
      </Page>
    </>
  );
}

function SitePicker({ sites, value, onChange }: { sites: SiteRow[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="max-w-sm">
      <SelectField label="Site" id="cr-site" value={value} onChange={(e) => onChange(e.target.value)}>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

/* ---------- daily ---------- */

function Daily({ sites, adminId }: { sites: SiteRow[]; adminId: string }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [reports, setReports] = useState<DailyReport[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const today = isoDate(startOfToday());
  const from = isoDate(addDays(startOfToday(), -13));

  const load = useCallback(async () => {
    if (!siteId) return;
    setReports(await listDailyReports(siteId, from, today).catch(() => []));
  }, [siteId, from, today]);

  useEffect(() => {
    load();
  }, [load]);

  const days = Array.from({ length: 14 }, (_, i) => isoDate(addDays(startOfToday(), -i)));

  return (
    <div className="space-y-6">
      <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
      <Panel title="Last 14 days" flush>
        {!reports ? (
          <Loading />
        ) : (
          <ul className="divide-hairline divide-y">
            {days.map((d) => {
              const r = reports.find((x) => x.report_date === d);
              return (
                <li key={d} className="px-6 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-caption text-ink">{fmtShortDay(d + "T12:00:00Z")}</span>
                    <span className="flex items-center gap-4">
                      {r ? <Status tone={r.status === "approved" ? "good" : "warn"}>{r.status === "approved" ? "Approved — client can see it" : "Draft"}</Status> : <Status tone="idle">No summary</Status>}
                      <button type="button" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink" onClick={() => setOpen(open === d ? null : d)}>
                        {open === d ? "Close" : r ? "Open" : "Write"}
                      </button>
                    </span>
                  </div>
                  {open === d && <DailyForm siteId={siteId} date={d} report={r} adminId={adminId} onSaved={load} />}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function DailyForm({ siteId, date, report, adminId, onSaved }: { siteId: string; date: string; report?: DailyReport; adminId: string; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(report ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (report) return;
    const from = ukToInstant(date);
    draftDailyReport(siteId, date, from.toISOString(), addDays(from, 1).toISOString())
      .then((d) => setDraft({ ...d, id: "", approved_at: null }))
      .catch(() => setMsg({ kind: "error", text: "Couldn't draft from the logs." }));
  }, [report, siteId, date]);

  if (!draft) return <Loading />;

  async function save(e: SyntheticEvent<HTMLFormElement>, status: "draft" | "approved") {
    e.preventDefault();
    const f = new FormData(e.currentTarget.form ?? (e.currentTarget as HTMLFormElement));
    setBusy(true);
    setMsg(null);
    try {
      await saveDailyReport(
        {
          id: report?.id,
          site_id: siteId,
          report_date: date,
          summary: String(f.get("summary") ?? "").trim(),
          visitors: f.get("visitors") === "" ? null : Number(f.get("visitors")),
          vehicles: f.get("vehicles") === "" ? null : Number(f.get("vehicles")),
          key_events: String(f.get("events") ?? "").trim() || null,
          status,
        },
        adminId,
      );
      await onSaved();
      setMsg({ kind: "info", text: status === "approved" ? "Approved. The client can now see it." : "Saved as a draft." });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save." });
    }
    setBusy(false);
  }

  return (
    <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => save(e, "approved")}>
      <div className="sm:col-span-2">
        <TextArea label="Summary for the client" id={`ds-${date}`} name="summary" rows={3} defaultValue={draft.summary} />
      </div>
      <Field label="Visitors" id={`dv-${date}`} name="visitors" type="number" min={0} defaultValue={draft.visitors ?? ""} />
      <Field label="Vehicles" id={`dc-${date}`} name="vehicles" type="number" min={0} defaultValue={draft.vehicles ?? ""} />
      <div className="sm:col-span-2">
        <TextArea label="Key events (one per line)" id={`de-${date}`} name="events" rows={4} defaultValue={draft.key_events ?? ""} />
      </div>
      {!report && <p className="text-micro text-stone sm:col-span-2">Drafted from the occurrence book, patrols and incidents. Check before approving — the client sees exactly this text.</p>}
      <div className="space-y-3 sm:col-span-2">
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <div className="flex flex-wrap gap-3">
          <PortalButton type="submit" disabled={busy}>
            Approve for client
          </PortalButton>
          <PortalButton tone="quiet" disabled={busy} onClick={(e) => save(e as unknown as SyntheticEvent<HTMLFormElement>, "draft")}>
            {report?.status === "approved" ? "Withdraw (back to draft)" : "Save draft"}
          </PortalButton>
        </div>
      </div>
    </form>
  );
}

/* ---------- patrol review ---------- */

function PatrolReview({ sites }: { sites: SiteRow[] }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [patrols, setPatrols] = useState<PatrolReport[] | null>(null);
  const [notes, setNotes] = useState<PatrolDayNote[]>([]);
  const from = addDays(startOfToday(), -13);

  const load = useCallback(async () => {
    if (!siteId) return;
    const [p, n] = await Promise.all([
      listPatrols(siteId, from.toISOString(), addDays(startOfToday(), 1).toISOString()).catch(() => []),
      listPatrolDayNotes(siteId, isoDate(from), isoDate(startOfToday())).catch(() => []),
    ]);
    setPatrols(p);
    setNotes(n);
  }, [siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  const incomplete = patrols?.filter((p) => !p.ended_at || (p.checkpoints_missed ?? 0) > 0) ?? [];
  const days = Array.from({ length: 14 }, (_, i) => isoDate(addDays(startOfToday(), -i)));

  return (
    <div className="space-y-6">
      <SitePicker sites={sites} value={siteId} onChange={setSiteId} />
      <Panel title="Incomplete patrols (hidden from the client unless released)" flush>
        {!patrols ? (
          <Loading />
        ) : incomplete.length === 0 ? (
          <Empty>No incomplete patrols in the last 14 days.</Empty>
        ) : (
          <ul className="divide-hairline divide-y">
            {incomplete.map((p) => (
              <PatrolNoteRow key={p.id} p={p} onSaved={load} />
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Day notes (shown with a day's patrol count, e.g. 6 of 8)" flush>
        <ul className="divide-hairline divide-y">
          {days.map((d) => (
            <DayNoteRow key={d} siteId={siteId} day={d} note={notes.find((n) => n.day === d)} onSaved={load} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

function PatrolNoteRow({ p, onSaved }: { p: PatrolReport; onSaved: () => Promise<void> }) {
  const [note, setNote] = useState(p.client_note ?? "");
  const [busy, setBusy] = useState(false);
  return (
    <li className="px-6 py-4">
      <p className="text-caption text-ink tabular-nums">
        {fmtShortDay(p.started_at)} {fmtTime(p.started_at)} · {p.officer_name} · {p.checkpoints_missed ?? "?"} of {p.checkpoints_total ?? "?"} checkpoints missed
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await setPatrolClientNote(p.id, note.trim() || null, Boolean(note.trim())).catch((err) => alert(err.message));
          await onSaved();
          setBusy(false);
        }}
      >
        <div className="min-w-64 flex-1">
          <Field label="Note for the client (leave empty to keep hidden)" id={`pn-${p.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Yard closed for a delivery; checked at 02:30 instead" />
        </div>
        <PortalButton type="submit" disabled={busy}>
          {note.trim() ? "Release with note" : "Keep hidden"}
        </PortalButton>
      </form>
    </li>
  );
}

function DayNoteRow({ siteId, day, note, onSaved }: { siteId: string; day: string; note?: PatrolDayNote; onSaved: () => Promise<void> }) {
  const [text, setText] = useState(note?.note ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(note?.note ?? ""), [note?.note]);
  return (
    <li className="px-6 py-3">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await savePatrolDayNote({ site_id: siteId, day, note: text.trim() || "—", shared: Boolean(text.trim()) }).catch((err) => alert(err.message));
          await onSaved();
          setBusy(false);
        }}
      >
        <span className="text-caption text-ink w-28">{fmtShortDay(day + "T12:00:00Z")}</span>
        <div className="min-w-64 flex-1">
          <Field label="Note" id={`dn-${day}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Empty = the client only sees patrols completed" />
        </div>
        <PortalButton tone="quiet" type="submit" disabled={busy}>
          {note?.shared ? "Update" : "Release"}
        </PortalButton>
      </form>
    </li>
  );
}

/* ---------- monthly ---------- */

function Monthly({ clients, sites, adminId }: { clients: Client[]; sites: SiteRow[]; adminId: string }) {
  const [clientId, setClientId] = useState("");
  const [reports, setReports] = useState<MonthlyReport[] | null>(null);
  const [month, setMonth] = useState(() => isoDate(startOfToday()).slice(0, 7));
  const [draft, setDraft] = useState<Omit<MonthlyReport, "id" | "approved_at"> & { id?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!clientId && clients[0]) setClientId(clients[0].id);
  }, [clients, clientId]);

  const load = useCallback(async () => {
    if (!clientId) return;
    setReports(await listMonthlyReports(clientId).catch(() => []));
  }, [clientId]);

  useEffect(() => {
    load();
    setDraft(null);
  }, [load]);

  async function generate() {
    setBusy(true);
    setMsg(null);
    try {
      const start = ukToInstant(`${month}-01`);
      const [y, m] = month.split("-").map(Number);
      const end = ukToInstant(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`);
      const mine = sites.filter((s) => s.client_id === clientId);
      const [shifts, incidents] = await Promise.all([listShifts(start.toISOString(), end.toISOString()), listIncidents(start.toISOString())]);
      const figures: MonthlyReport["figures"] = {};
      for (const s of mine) {
        const list = shifts.filter((x) => x.site_id === s.id && x.published && Date.parse(x.starts_at) < end.getTime());
        const patrols = await listPatrols(s.id, start.toISOString(), end.toISOString());
        figures[s.id] = {
          site: s.name,
          shifts: list.length,
          shifts_covered: list.filter((x) => x.assignments.filter((a) => a.status === "accepted").length >= x.guards_required).length,
          patrols: patrols.filter((p) => p.ended_at && !p.checkpoints_missed).length,
          incidents: incidents.filter((i) => i.site_id === s.id && Date.parse(i.occurred_at) < end.getTime()).length,
        };
      }
      const existing = reports?.find((r) => r.month === `${month}-01`);
      const totals = Object.values(figures).reduce((a, f) => ({ shifts: a.shifts + f.shifts, covered: a.covered + f.shifts_covered, patrols: a.patrols + f.patrols, incidents: a.incidents + f.incidents }), { shifts: 0, covered: 0, patrols: 0, incidents: 0 });
      setDraft({
        id: existing?.id,
        client_id: clientId,
        month: `${month}-01`,
        figures,
        status: "draft",
        summary:
          existing?.summary ||
          `${totals.covered} of ${totals.shifts} shifts fully staffed, ${totals.patrols} patrols completed and ${totals.incidents} incident${totals.incidents === 1 ? "" : "s"} recorded across ${mine.length} site${mine.length === 1 ? "" : "s"}.`,
      });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Couldn't generate." });
    }
    setBusy(false);
  }

  async function save(status: "draft" | "approved") {
    if (!draft) return;
    setBusy(true);
    try {
      await saveMonthlyReport({ ...draft, status }, adminId);
      await load();
      setMsg({ kind: "info", text: status === "approved" ? "Approved. The client can now see and download it." : "Saved as a draft." });
      setDraft(null);
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Couldn't save." });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <div className="grid max-w-xl gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <SelectField label="Client" id="mr-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
        <Field label="Month" id="mr-month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <PortalButton disabled={busy || !clientId} onClick={generate}>
          Generate
        </PortalButton>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {draft && (
        <Panel title={`Draft · ${new Date(draft.month + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`}>
          <table className="w-full">
            <thead>
              <tr className="text-micro text-stone text-left">
                <th className="py-2 font-normal">Site</th>
                <th className="py-2 font-normal">Shifts staffed</th>
                <th className="py-2 font-normal">Patrols</th>
                <th className="py-2 font-normal">Incidents</th>
              </tr>
            </thead>
            <tbody className="divide-hairline divide-y">
              {Object.values(draft.figures).map((f) => (
                <tr key={f.site} className="text-caption text-ink tabular-nums">
                  <td className="py-2">{f.site}</td>
                  <td className="py-2">
                    {f.shifts_covered} of {f.shifts}
                  </td>
                  <td className="py-2">{f.patrols}</td>
                  <td className="py-2">{f.incidents}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-5">
            <TextArea label="Service summary (the client sees this)" id="mr-summary" rows={5} value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <PortalButton disabled={busy} onClick={() => save("approved")}>
              Approve for client
            </PortalButton>
            <PortalButton tone="quiet" disabled={busy} onClick={() => save("draft")}>
              Save draft
            </PortalButton>
          </div>
        </Panel>
      )}
      <Panel title="Reports" flush>
        {!reports ? (
          <Loading />
        ) : reports.length === 0 ? (
          <Empty>No monthly reports for this client yet.</Empty>
        ) : (
          <ul className="divide-hairline divide-y">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <span className="text-caption text-ink">{new Date(r.month + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
                <span className="flex items-center gap-4">
                  <Status tone={r.status === "approved" ? "good" : "warn"}>{r.status === "approved" ? "Approved" : "Draft"}</Status>
                  <button
                    type="button"
                    className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
                    onClick={() => {
                      setMonth(r.month.slice(0, 7));
                      setDraft({ id: r.id, client_id: r.client_id, month: r.month, figures: r.figures, summary: r.summary, status: r.status });
                    }}
                  >
                    Open
                  </button>
                  {r.status === "approved" && (
                    <a href={`#/preview/${r.client_id}/monthly`} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                      Preview as client
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
