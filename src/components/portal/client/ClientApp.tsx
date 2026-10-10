import { useCallback, useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import PortalShell from "../PortalShell";
import type { Profile } from "../../../lib/portalSupabase";
import { Field, fmtDay, fmtShortDay, fmtTime, Loading, mapsUrl, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { addDays, isoDate, startOfToday } from "../admin/adminData";
import { Empty, Page, PageHeader, Panel, Stat, Status, Table, td } from "../admin/kit";
import { categoryLabel } from "../officers/ops";
import {
  loadAttendance,
  loadDaily,
  loadIncidents,
  loadMonthly,
  loadPatrolDays,
  loadPatrols,
  loadProfile,
  loadRequests,
  loadSiteStatus,
  photoUrl,
  raiseRequest,
  type ClientIncident,
  type ClientProfile,
  type ClientRequest,
  type DailySummary,
  type MonthlySummary,
  type Patrol,
  type PatrolDay,
  type Section,
  type SiteStatus,
} from "./clientData";

/**
 * Client portal (portal.harleygarrison.co.uk). Built on the principle
 * that a client sees the SERVICE, not the workforce:
 *   Site status · Patrols · Incidents · Daily summaries · Monthly report
 *   · Requests · Contact (+ Attendance, only if the office enabled it).
 * Everything comes from the database's client-visible functions; nothing
 * appears unless the office has released or approved it. Officer names
 * ("Ahmed N."), locations and attendance times appear only if switched
 * on for this client.
 *
 * The same component renders the admin's "Preview as client" view
 * (`clientId` set), so what the office previews is exactly what the
 * client sees.
 */

const ALL: { key: Section | "attendance"; label: string }[] = [
  { key: "status", label: "Site status" },
  { key: "patrols", label: "Patrols" },
  { key: "incidents", label: "Incidents" },
  { key: "daily", label: "Daily summaries" },
  { key: "monthly", label: "Monthly report" },
  { key: "attendance", label: "Attendance" },
  { key: "requests", label: "Requests" },
  { key: "contact", label: "Contact" },
];

const REQUEST_KIND = { extra_patrol: "Extra patrol", expected_visitor: "Expected visitor", access_issue: "Access issue", other: "Other" } as const;
const REQUEST_STATUS: Record<ClientRequest["status"], { tone: "good" | "warn" | "bad" | "idle"; label: string }> = {
  open: { tone: "warn", label: "Received" },
  in_progress: { tone: "warn", label: "In progress" },
  done: { tone: "good", label: "Done" },
  declined: { tone: "idle", label: "Not possible" },
};

export default function ClientApp() {
  return (
    <PortalShell portalName="Client portal" tagline="Site status, patrols, incident reports and service summaries for your sites." role="client">
      {({ profile, signOut }) => <Client profile={profile} signOut={signOut} />}
    </PortalShell>
  );
}

function useRoute(prefix: string) {
  const read = () => window.location.hash.replace(/^#\/?/, "").replace(prefix, "").replace(/^\/?/, "").split("/");
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return parts;
}

export function Client({ profile, signOut }: { profile: Profile; signOut: () => Promise<void> }) {
  return (
    <ClientPortal
      hrefBase="#/"
      right={
        <>
          <span className="text-caption text-stone hidden md:inline">{profile.full_name}</span>
          <button type="button" onClick={signOut} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
            Sign out
          </button>
        </>
      }
    />
  );
}

/**
 * The portal body. `clientId` + `hrefBase` let the admin dashboard embed
 * it as a preview under its own route (e.g. "#/preview/<id>/").
 */
export function ClientPortal({ clientId, hrefBase, right, preview = false }: { clientId?: string; hrefBase: string; right?: ReactNode; preview?: boolean }) {
  const routePrefix = hrefBase.replace(/^#\/?/, "");
  const [section] = useRoute(routePrefix);
  const [me, setMe] = useState<ClientProfile | null | undefined>(undefined);

  useEffect(() => {
    loadProfile(clientId)
      .then(setMe)
      .catch(() => setMe(null));
  }, [clientId]);

  if (me === undefined) return <Loading />;
  if (me === null) {
    return (
      <Page>
        <Notice kind="error">Your account isn't linked to a client yet. Contact Harley Garrison.</Notice>
      </Page>
    );
  }

  const tabs = ALL.filter((t) => (t.key === "attendance" ? me.share_attendance : me.sections.includes(t.key)));
  const active = tabs.find((t) => t.key === section)?.key ?? tabs[0]?.key;

  let page: ReactNode = <Empty>Nothing to show.</Empty>;
  if (active === "status") page = <StatusPage me={me} clientId={clientId} />;
  else if (active === "patrols") page = <PatrolsPage clientId={clientId} />;
  else if (active === "incidents") page = <IncidentsPage clientId={clientId} />;
  else if (active === "daily") page = <DailyPage clientId={clientId} />;
  else if (active === "monthly") page = <MonthlyPage me={me} clientId={clientId} />;
  else if (active === "attendance") page = <AttendancePage clientId={clientId} />;
  else if (active === "requests") page = <RequestsPage clientId={clientId} preview={preview} />;
  else if (active === "contact") page = <ContactPage me={me} />;

  return (
    <div className="bg-surface-alt min-h-dvh">
      <div className="border-hairline bg-paper border-b print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-gutter pt-4 md:px-10">
          <div className="flex items-center gap-5">
            <img src="/logo/logo-horizontal.svg" alt="Harley Garrison" width="141" height="32" className="force-light-img h-8 w-auto" />
            <span className="text-caption text-stone border-hairline hidden border-l pl-5 sm:inline">{me.client_name}</span>
          </div>
          <div className="flex items-center gap-5">{right}</div>
        </div>
        <nav aria-label="Client portal" className="mt-3 overflow-x-auto px-gutter md:px-10">
          <ul className="flex gap-7">
            {tabs.map((t) => (
              <li key={t.key}>
                <a
                  href={`${hrefBase}${t.key}`}
                  aria-current={active === t.key ? "page" : undefined}
                  className={`text-caption inline-block border-b-2 pb-3 whitespace-nowrap transition-colors ${active === t.key ? "border-amber text-ink" : "text-stone hover:text-ink border-transparent"}`}
                >
                  {t.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <main>{page}</main>
    </div>
  );
}

function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await fn());
      setError(null);
    } catch {
      setError("This couldn't be loaded. Check your connection and refresh.");
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  return { data, error, reload: load };
}

/* ---------- site status ---------- */

function StatusPage({ me, clientId }: { me: ClientProfile; clientId?: string }) {
  const { data, error, reload } = useLoad(() => loadSiteStatus(clientId), [clientId]);
  useEffect(() => {
    const t = setInterval(reload, 60_000);
    return () => clearInterval(t);
  }, [reload]);
  const covered = data?.filter((s) => s.status === "covered").length ?? 0;
  const week = data?.reduce((a, s) => ({ all: a.all + s.shifts_this_week, ok: a.ok + s.shifts_covered_this_week }), { all: 0, ok: 0 });
  return (
    <>
      <PageHeader offset={false} title="Site status" subtitle={fmtDay(new Date().toISOString())} />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-px">
          <Stat feature label="Sites covered now" value={data ? `${covered} of ${data.length}` : "–"} note="Updated every minute" />
          <Stat label="Service level this week" value={week && week.all ? `${Math.round((week.ok / week.all) * 100)}%` : "–"} note={week ? `${week.ok} of ${week.all} shifts fully staffed` : undefined} />
        </div>
        <Panel flush>
          {!data ? (
            <Loading />
          ) : data.length === 0 ? (
            <Empty>No active sites.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {data.map((s: SiteStatus) => (
                <li key={s.site_id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
                  <div className="min-w-0">
                    <p className="text-h4 text-ink">{s.site_name}</p>
                    {s.address && <p className="text-caption text-stone">{s.address}</p>}
                    {me.share_names && s.officers_on_site && s.officers_on_site.length > 0 && <p className="text-caption text-ink mt-1">On site: {s.officers_on_site.join(", ")}</p>}
                  </div>
                  <Status tone={s.status === "covered" ? "good" : "warn"}>{s.status === "covered" ? "Site covered" : "Needs attention"}</Status>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <p className="text-micro text-stone">"Needs attention" means our control room is already dealing with cover at that site. Call us any time for an update.</p>
      </Page>
    </>
  );
}

/* ---------- patrols ---------- */

function PatrolsPage({ clientId }: { clientId?: string }) {
  const to = isoDate(startOfToday());
  const from = isoDate(addDays(startOfToday(), -13));
  const days = useLoad(() => loadPatrolDays(from, to, clientId), [clientId, from]);
  const patrols = useLoad(() => loadPatrols(from, to, clientId), [clientId, from]);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <>
      <PageHeader offset={false} title="Patrols" subtitle="Last 14 days" />
      <Page>
        {(days.error || patrols.error) && <Notice kind="error">{days.error ?? patrols.error}</Notice>}
        <Panel flush>
          {!days.data || !patrols.data ? (
            <Loading />
          ) : days.data.length === 0 ? (
            <Empty>No patrols recorded in the last 14 days.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {days.data.map((d: PatrolDay) => {
                const key = `${d.site_id}:${d.day}`;
                const list = patrols.data!.filter((p) => p.site_id === d.site_id && isoDate(new Date(p.started_at)) === d.day);
                return (
                  <li key={key} className="px-6 py-4">
                    <button type="button" className="flex w-full flex-wrap items-center justify-between gap-3 text-left" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)}>
                      <span>
                        <span className="text-caption text-ink block">{fmtShortDay(d.day + "T12:00:00Z")}</span>
                        <span className="text-micro text-stone block">{d.site_name}</span>
                      </span>
                      <Status tone={d.expected == null || d.completed >= d.expected ? "good" : "warn"}>
                        {d.expected != null ? `${d.completed} of ${d.expected} completed` : `${d.completed} completed`}
                      </Status>
                    </button>
                    {d.note && <p className="text-caption text-ink mt-2">Note from Harley Garrison: {d.note}</p>}
                    {open === key && (
                      <ul className="mt-4 space-y-4">
                        {list.map((p: Patrol) => (
                          <li key={p.patrol_id} className="border-hairline border-l-2 pl-4">
                            <p className="text-caption text-ink tabular-nums">
                              {fmtTime(p.started_at)} – {fmtTime(p.ended_at)} · {p.checkpoints_done} of {p.checkpoints_total ?? p.checkpoints_done} checkpoints
                              {p.officer ? ` · ${p.officer}` : ""}
                            </p>
                            {p.note && <p className="text-caption text-ink">Note: {p.note}</p>}
                            <p className="text-micro text-stone mt-1">
                              {p.scans.map((s, i) => (
                                <span key={i}>
                                  {i > 0 && " · "}
                                  {s.checkpoint} {fmtTime(s.at)}
                                  {s.lat != null && s.lng != null && (
                                    <>
                                      {" "}
                                      <a href={mapsUrl({ latitude: s.lat, longitude: s.lng, name: "", address: "" })} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
                                        map
                                      </a>
                                    </>
                                  )}
                                </span>
                              ))}
                            </p>
                          </li>
                        ))}
                        {list.length === 0 && <li className="text-caption text-stone">Details not available for this day.</li>}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </Page>
    </>
  );
}

/* ---------- incidents ---------- */

function IncidentsPage({ clientId }: { clientId?: string }) {
  const to = isoDate(addDays(startOfToday(), 1));
  const from = isoDate(addDays(startOfToday(), -90));
  const { data, error } = useLoad(() => loadIncidents(from, to, clientId), [clientId, from]);
  const [open, setOpen] = useState<string | null>(null);
  const selected = data?.find((i) => i.incident_id === open);

  if (selected) return <IncidentDetail i={selected} onBack={() => setOpen(null)} />;

  return (
    <>
      <PageHeader offset={false} title="Incident reports" subtitle="Last 90 days" />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!data ? (
            <Loading />
          ) : data.length === 0 ? (
            <Empty>No incident reports have been shared with you in the last 90 days.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {data.map((i: ClientIncident) => (
                <li key={i.incident_id}>
                  <button type="button" onClick={() => setOpen(i.incident_id)} className="hover:bg-surface-alt flex w-full flex-wrap items-start justify-between gap-3 px-6 py-4 text-left">
                    <span className="min-w-0">
                      <span className="text-caption text-ink block">{i.title}</span>
                      <span className="text-micro text-stone block tabular-nums">
                        {fmtShortDay(i.occurred_at)} {fmtTime(i.occurred_at)} · {i.site_name} · {categoryLabel(i.category)}
                      </span>
                    </span>
                    <Status tone={i.status === "closed" ? "good" : "warn"}>{i.status === "closed" ? "Closed" : "Being handled"}</Status>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Page>
    </>
  );
}

function IncidentDetail({ i, onBack }: { i: ClientIncident; onBack: () => void }) {
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    Promise.all(i.photos.map(photoUrl)).then(setUrls);
  }, [i.photos]);
  return (
    <>
      <PageHeader
        offset={false}
        title={i.title}
        subtitle={`${i.site_name} · ${categoryLabel(i.category)}`}
        actions={
          <>
            <button type="button" onClick={() => window.print()} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink print:hidden">
              Print
            </button>
            <button type="button" onClick={onBack} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink print:hidden">
              All incidents
            </button>
          </>
        }
      />
      <Page>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="space-y-8">
            <Panel title="Report">
              <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {[
                  ["Happened", `${fmtDay(i.occurred_at)}, ${fmtTime(i.occurred_at)}`],
                  ["Severity", i.severity[0].toUpperCase() + i.severity.slice(1)],
                  ["Status", i.status === "closed" ? "Closed" : "Being handled"],
                  ["Police reference", i.police_ref ?? "—"],
                  ...(i.officer ? [["Officer", i.officer]] : []),
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-caption text-stone">{k}</dt>
                    <dd className="text-caption text-ink mt-0.5">{v}</dd>
                  </div>
                ))}
                {i.lat != null && i.lng != null && (
                  <div>
                    <dt className="text-caption text-stone">Location</dt>
                    <dd className="text-caption text-ink mt-0.5">
                      <a href={mapsUrl({ latitude: i.lat, longitude: i.lng, name: "", address: "" })} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                        View on map
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
              {i.client_summary && (
                <>
                  <h3 className="text-h4 text-ink mt-8">Summary</h3>
                  <p className="text-caption text-ink mt-2 whitespace-pre-line break-words">{i.client_summary}</p>
                </>
              )}
              <h3 className="text-h4 text-ink mt-8">Officer's account</h3>
              <p className="text-caption text-ink mt-2 whitespace-pre-line break-words">{i.description}</p>
            </Panel>
            {i.photos.length > 0 && (
              <Panel title="Photos">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {urls.map((u, n) =>
                    u ? (
                      <a key={n} href={u} target="_blank" rel="noopener noreferrer">
                        <img src={u} alt={`Photo ${n + 1} of the incident`} className="bg-surface-alt aspect-square w-full object-cover" />
                      </a>
                    ) : (
                      <div key={n} className="bg-surface-alt aspect-square" />
                    ),
                  )}
                </div>
              </Panel>
            )}
          </div>
          <Panel title="Timeline" flush>
            <ol className="divide-hairline divide-y">
              <li className="px-6 py-3">
                <p className="text-micro text-stone tabular-nums">
                  {fmtShortDay(i.reported_at)} {fmtTime(i.reported_at)}
                </p>
                <p className="text-caption text-ink">Reported by our officer</p>
              </li>
              {i.timeline.map((t, n) => (
                <li key={n} className="px-6 py-3">
                  <p className="text-micro text-stone tabular-nums">
                    {fmtShortDay(t.at)} {fmtTime(t.at)}
                  </p>
                  <p className="text-caption text-ink whitespace-pre-line break-words">{t.text}</p>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </Page>
    </>
  );
}

/* ---------- daily summaries ---------- */

function DailyPage({ clientId }: { clientId?: string }) {
  const to = isoDate(startOfToday());
  const from = isoDate(addDays(startOfToday(), -30));
  const { data, error } = useLoad(() => loadDaily(from, to, clientId), [clientId, from]);
  return (
    <>
      <PageHeader offset={false} title="Daily summaries" subtitle="Last 30 days" />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {!data ? (
          <Loading />
        ) : data.length === 0 ? (
          <Panel>
            <p className="text-caption text-stone">No daily summaries yet.</p>
          </Panel>
        ) : (
          data.map((d: DailySummary) => (
            <Panel key={d.report_id} title={`${fmtDay(d.report_date + "T12:00:00Z")} · ${d.site_name}`}>
              <p className="text-caption text-ink whitespace-pre-line">{d.summary}</p>
              {(d.visitors != null || d.vehicles != null) && (
                <p className="text-caption text-stone mt-3">
                  {d.visitors != null ? `${d.visitors} visitor${d.visitors === 1 ? "" : "s"}` : ""}
                  {d.visitors != null && d.vehicles != null ? " · " : ""}
                  {d.vehicles != null ? `${d.vehicles} vehicle${d.vehicles === 1 ? "" : "s"}` : ""}
                </p>
              )}
              {d.key_events && (
                <ul className="text-caption text-ink mt-3 list-disc space-y-1 pl-5">
                  {d.key_events.split("\n").filter(Boolean).map((e, n) => (
                    <li key={n}>{e}</li>
                  ))}
                </ul>
              )}
            </Panel>
          ))
        )}
      </Page>
    </>
  );
}

/* ---------- monthly report (print / save as PDF) ---------- */

function MonthlyPage({ me, clientId }: { me: ClientProfile; clientId?: string }) {
  const { data, error } = useLoad(() => loadMonthly(clientId), [clientId]);
  const [selected, setSelected] = useState<string | null>(null);
  const r = data?.find((x) => x.report_id === selected) ?? data?.[0];
  const monthName = (m: string) => new Date(m + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  return (
    <>
      <PageHeader
        offset={false}
        title="Monthly report"
        actions={
          r && (
            <div className="flex flex-wrap items-center gap-3 print:hidden">
              {data && data.length > 1 && (
                <select aria-label="Month" value={r.report_id} onChange={(e) => setSelected(e.target.value)} className="text-caption border-ink/30 text-ink min-h-11 border bg-paper px-3">
                  {data.map((x) => (
                    <option key={x.report_id} value={x.report_id}>
                      {monthName(x.month)}
                    </option>
                  ))}
                </select>
              )}
              <PortalButton className="min-h-11 px-5" onClick={() => window.print()}>
                Download PDF
              </PortalButton>
            </div>
          )
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {!data ? (
          <Loading />
        ) : !r ? (
          <Panel>
            <p className="text-caption text-stone">Your first monthly report will appear here once it's ready.</p>
          </Panel>
        ) : (
          <MonthlyDocument me={me} r={r as MonthlySummary} title={monthName(r.month)} />
        )}
        <p className="text-micro text-stone print:hidden">"Download PDF" opens your browser's print window — choose "Save as PDF".</p>
      </Page>
    </>
  );
}

function MonthlyDocument({ me, r, title }: { me: ClientProfile; r: MonthlySummary; title: string }) {
  const rows = Object.values(r.figures);
  const t = rows.reduce((a, f) => ({ shifts: a.shifts + f.shifts, covered: a.covered + f.shifts_covered, patrols: a.patrols + f.patrols, incidents: a.incidents + f.incidents }), { shifts: 0, covered: 0, patrols: 0, incidents: 0 });
  return (
    <article className="border-hairline bg-paper border p-8 print:border-0 print:p-0">
      <header className="border-hairline flex flex-wrap items-end justify-between gap-4 border-b pb-6">
        <div>
          <img src="/logo/logo-horizontal.svg" alt="Harley Garrison" width="141" height="32" className="force-light-img h-8 w-auto" />
          <h2 className="text-h2 text-ink mt-6">Service report · {title}</h2>
          <p className="text-caption text-stone mt-1">Prepared for {me.client_name}</p>
        </div>
        <p className="text-micro text-stone">Approved {fmtShortDay(r.approved_at)}</p>
      </header>
      <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {[
          ["Shifts fully staffed", `${t.covered} of ${t.shifts}`],
          ["Service level", t.shifts ? `${Math.round((t.covered / t.shifts) * 100)}%` : "—"],
          ["Patrols completed", String(t.patrols)],
          ["Incidents", String(t.incidents)],
        ].map(([k, v]) => (
          <div key={k}>
            <p className="text-caption text-stone">{k}</p>
            <p className="text-h3 text-ink mt-1 tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <h3 className="text-h4 text-ink mt-10">Summary</h3>
      <p className="text-caption text-ink mt-2 whitespace-pre-line">{r.summary}</p>
      <h3 className="text-h4 text-ink mt-10">By site</h3>
      <div className="mt-3 overflow-x-auto">
        <Table head={["Site", "Shifts staffed", "Patrols", "Incidents"]}>
          {rows.map((f) => (
            <tr key={f.site}>
              <td className={td}>{f.site}</td>
              <td className={`${td} tabular-nums`}>
                {f.shifts_covered} of {f.shifts}
              </td>
              <td className={`${td} tabular-nums`}>{f.patrols}</td>
              <td className={`${td} tabular-nums`}>{f.incidents}</td>
            </tr>
          ))}
        </Table>
      </div>
    </article>
  );
}

/* ---------- attendance (only if enabled by the office) ---------- */

function AttendancePage({ clientId }: { clientId?: string }) {
  const to = isoDate(startOfToday());
  const from = isoDate(addDays(startOfToday(), -13));
  const { data, error } = useLoad(() => loadAttendance(from, to, clientId), [clientId, from]);
  return (
    <>
      <PageHeader offset={false} title="Attendance" subtitle="Last 14 days" />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!data ? (
            <Loading />
          ) : data.length === 0 ? (
            <Empty>No shifts in this period.</Empty>
          ) : (
            <Table head={["Shift", "Site", "Officer", "Arrived", "Left"]}>
              {data.map((a, n) => (
                <tr key={n}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {fmtShortDay(a.starts_at)} · {fmtTime(a.starts_at)}–{fmtTime(a.ends_at)}
                  </td>
                  <td className={td}>{a.site_name}</td>
                  <td className={td}>{a.officer}</td>
                  <td className={`${td} tabular-nums`}>
                    {a.arrived ? fmtTime(a.arrived) : "—"}
                    {a.arrived && a.arrived_on_site && <span className="text-micro text-stone block">On site</span>}
                  </td>
                  <td className={`${td} tabular-nums`}>{a.left_at ? fmtTime(a.left_at) : "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </Page>
    </>
  );
}

/* ---------- requests ---------- */

function RequestsPage({ clientId, preview }: { clientId?: string; preview: boolean }) {
  const { data, error, reload } = useLoad(() => loadRequests(clientId), [clientId]);
  const sites = useLoad(() => loadSiteStatus(clientId), [clientId]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const details = String(f.get("details") ?? "").trim();
    if (!details) return setMsg({ kind: "error", text: "Tell us what you need." });
    const date = String(f.get("date") ?? "");
    const time = String(f.get("time") ?? "");
    setBusy(true);
    setMsg(null);
    try {
      const { localToIso } = await import("../admin/adminData");
      await raiseRequest(String(f.get("site") ?? "") || null, f.get("kind") as ClientRequest["kind"], details, date ? localToIso(date, time || "00:00") : null);
      form.reset();
      setMsg({ kind: "info", text: "Sent to our control room. You'll see updates here." });
      await reload();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Couldn't send. Please call us instead." });
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader offset={false} title="Requests" subtitle="Extra patrols, expected visitors, access issues" />
      <Page>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Panel title="New request">
            {preview ? (
              <p className="text-caption text-stone">Requests can't be sent from a preview.</p>
            ) : (
              <form onSubmit={submit} className="space-y-4" noValidate>
                <SelectField label="Type" id="cr-kind" name="kind" defaultValue="extra_patrol">
                  {Object.entries(REQUEST_KIND).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Site" id="cr-site" name="site" defaultValue="">
                  <option value="">Any / not site-specific</option>
                  {(sites.data ?? []).map((s) => (
                    <option key={s.site_id} value={s.site_id}>
                      {s.site_name}
                    </option>
                  ))}
                </SelectField>
                <TextArea label="Details" id="cr-details" name="details" rows={4} placeholder="e.g. Contractor arriving 07:30 Tuesday, van reg AB12 CDE" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="When (optional)" id="cr-date" name="date" type="date" />
                  <Field label="Time" id="cr-time" name="time" type="time" />
                </div>
                {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
                <PortalButton type="submit" disabled={busy}>
                  {busy ? "Sending" : "Send to control room"}
                </PortalButton>
                <p className="text-micro text-stone">For anything urgent, call the control room.</p>
              </form>
            )}
          </Panel>
          <Panel title="Your requests" flush>
            {error && (
              <div className="p-6">
                <Notice kind="error">{error}</Notice>
              </div>
            )}
            {!data ? (
              <Loading />
            ) : data.length === 0 ? (
              <Empty>No requests yet.</Empty>
            ) : (
              <ul className="divide-hairline divide-y">
                {data.map((r) => (
                  <li key={r.request_id} className="px-6 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-caption text-ink">
                          {REQUEST_KIND[r.kind]}
                          {r.site_name ? ` · ${r.site_name}` : ""}
                        </p>
                        <p className="text-caption text-ink mt-1 whitespace-pre-line break-words">{r.details}</p>
                        <p className="text-micro text-stone mt-1 tabular-nums">
                          Sent {fmtShortDay(r.created_at)} {fmtTime(r.created_at)}
                          {r.wanted_at ? ` · for ${fmtShortDay(r.wanted_at)} ${fmtTime(r.wanted_at)}` : ""}
                        </p>
                        {r.response && <p className="text-caption text-ink mt-2">Reply: {r.response}</p>}
                      </div>
                      <Status tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Status>
                    </div>
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

/* ---------- contact ---------- */

function ContactPage({ me }: { me: ClientProfile }) {
  const tel = (p: string) => `tel:${p.replace(/\s+/g, "")}`;
  return (
    <>
      <PageHeader offset={false} title="Contact" />
      <Page>
        <div className="grid gap-8 xl:grid-cols-2">
          <section className="on-dark bg-electric-blue text-paper px-6 py-7 sm:px-8" aria-label="Control room">
            <p className="text-caption text-paper/85">Control room, 24 hours</p>
            {me.control_room_phone ? (
              <a href={tel(me.control_room_phone)} className="text-h2 mt-3 block tabular-nums underline-offset-4 hover:underline">
                {me.control_room_phone}
              </a>
            ) : (
              <p className="text-body mt-3">Number to be confirmed by your account manager.</p>
            )}
          </section>
          <Panel title="Your account manager">
            {me.account_manager_name ? (
              <dl className="space-y-3">
                <div>
                  <dt className="text-caption text-stone">Name</dt>
                  <dd className="text-caption text-ink">{me.account_manager_name}</dd>
                </div>
                {me.account_manager_phone && (
                  <div>
                    <dt className="text-caption text-stone">Phone</dt>
                    <dd>
                      <a href={tel(me.account_manager_phone)} className="text-caption text-ink underline underline-offset-4">
                        {me.account_manager_phone}
                      </a>
                    </dd>
                  </div>
                )}
                {me.account_manager_email && (
                  <div>
                    <dt className="text-caption text-stone">Email</dt>
                    <dd>
                      <a href={`mailto:${me.account_manager_email}`} className="text-caption text-ink break-all underline underline-offset-4">
                        {me.account_manager_email}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-caption text-stone">Details to follow.</p>
            )}
          </Panel>
        </div>
      </Page>
    </>
  );
}
