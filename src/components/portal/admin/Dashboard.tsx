import { useCallback, useEffect, useState } from "react";
import { fmtDay, fmtTime, Loading, Notice } from "../ui";
import { IconPlus } from "./icons";
import { addDays, attendance, listClockEvents, listShifts, startOfToday, type ClockRow, type ShiftRow } from "./adminData";
import { Empty, LinkButton, Page, PageHeader, Panel, Status, Table, td } from "./kit";
import { ALERT_LABEL, compliance, listAlerts, listDocuments, listIncidents, type AlertRow, type DocumentRow, type IncidentRow } from "./opsData";

/**
 * Dashboard: five live counters (on site, late, missed patrols, open
 * incidents, expiring licences) — each one a link to the screen that
 * deals with it — then today's sites with a green/amber/red status, and
 * the open-alerts feed on the side. Refreshes every 30 seconds and the
 * moment a new alert arrives (`tick`, from AdminApp's live feed).
 *
 * Site status: RED = an open alert there or an officer who didn't turn
 * up; AMBER = someone late, a post short of officers, or an overdue
 * patrol/check-in alert; GREEN = everything as planned. Colour is never
 * the only signal — each row also says why.
 */

type Tone = "good" | "warn" | "bad" | "idle";

interface SiteLine {
  site_id: string;
  site_name: string;
  shifts: ShiftRow[];
  required: number;
  onSite: number;
  late: number;
  noShow: number;
  alerts: AlertRow[];
  tone: Tone;
  reason: string;
}

export default function Dashboard({ tick }: { tick: number }) {
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [events, setEvents] = useState<ClockRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [patrolAlerts, setPatrolAlerts] = useState(0);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const today = startOfToday();
      const list = await listShifts(addDays(today, -1).toISOString(), addDays(today, 1).toISOString());
      const ids = list.flatMap((s) => s.assignments.filter((a) => a.status === "accepted").map((a) => a.id));
      const [ev, open, todays, inc, d] = await Promise.all([
        listClockEvents(addDays(today, -2).toISOString(), ids),
        listAlerts({ open: true }),
        listAlerts({ sinceIso: today.toISOString() }),
        listIncidents(addDays(today, -90).toISOString()),
        listDocuments(),
      ]);
      // Keep shifts that run today (including overnight ones from yesterday).
      setShifts(list.filter((s) => Date.parse(s.ends_at) > today.getTime()));
      setEvents(ev);
      setAlerts(open);
      setPatrolAlerts(todays.filter((a) => a.kind === "patrol_overdue" || a.kind === "missed_checkpoints").length);
      setIncidents(inc.filter((i) => i.status !== "closed"));
      setDocs(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the dashboard.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load, tick]);

  const header = (
    <PageHeader
      title="Dashboard"
      subtitle={fmtDay(new Date().toISOString())}
      actions={
        <LinkButton href="#/rota/new">
          <IconPlus width={16} height={16} />
          New shift
        </LinkButton>
      }
    />
  );

  if (!shifts) {
    return (
      <>
        {header}
        <Page>{error ? <Notice kind="error">{error}</Notice> : <Loading label="Loading today" />}</Page>
      </>
    );
  }

  const now = Date.now();
  const rows = shifts.flatMap((s) =>
    s.assignments
      .filter((a) => a.status === "accepted")
      .map((a) => ({ s, a, att: attendance(s, events.filter((e) => e.assignment_id === a.id)) })),
  );
  const onSite = rows.filter((r) => r.att === "on-duty").length;
  const late = rows.filter((r) => r.att === "late" || r.att === "no-show").length;

  const byGuard = new Map<string, DocumentRow[]>();
  for (const d of docs) byGuard.set(d.guard_id, [...(byGuard.get(d.guard_id) ?? []), d]);
  const expiringDocs = docs.filter((d) => {
    if (!d.verified_at || !d.expires_on) return false;
    const [y, m, dd] = d.expires_on.split("-").map(Number);
    return Date.UTC(y, m - 1, dd) - now < 60 * 86_400_000;
  });

  // One line per site that has a shift running today.
  const sites = new Map<string, SiteLine>();
  for (const s of shifts) {
    const line = sites.get(s.site_id) ?? { site_id: s.site_id, site_name: s.site_name, shifts: [], required: 0, onSite: 0, late: 0, noShow: 0, alerts: [], tone: "good" as Tone, reason: "" };
    line.shifts.push(s);
    const running = Date.parse(s.starts_at) <= now && Date.parse(s.ends_at) > now;
    if (running) line.required += s.guards_required;
    for (const r of rows.filter((x) => x.s.id === s.id)) {
      if (r.att === "on-duty") line.onSite++;
      if (r.att === "late") line.late++;
      if (r.att === "no-show") line.noShow++;
    }
    sites.set(s.site_id, line);
  }
  for (const a of alerts) {
    const line = [...sites.values()].find((l) => l.site_name === a.site_name);
    if (line) line.alerts.push(a);
  }
  for (const l of sites.values()) {
    const short = l.required > l.onSite;
    const urgent = l.alerts.some((a) => a.kind === "panic" || a.kind === "incident");
    if (urgent || l.noShow) {
      l.tone = "bad";
      l.reason = urgent ? `${l.alerts.length} open alert${l.alerts.length === 1 ? "" : "s"}` : `${l.noShow} didn't turn up`;
    } else if (l.late || short || l.alerts.length) {
      l.tone = "warn";
      l.reason = l.late ? `${l.late} late` : short ? `${l.required - l.onSite} short` : ALERT_LABEL[l.alerts[0].kind];
    } else {
      l.tone = "good";
      l.reason = l.required ? "Fully covered" : "No one due now";
    }
  }
  const siteLines = [...sites.values()].sort((a, b) => ({ bad: 0, warn: 1, good: 2, idle: 3 })[a.tone] - ({ bad: 0, warn: 1, good: 2, idle: 3 })[b.tone] || a.site_name.localeCompare(b.site_name));
  const blocked = [...byGuard.values()].filter((d) => compliance(d).status === "blocked").length;

  const counters = [
    { href: "#/control", label: "On site now", value: onSite, note: `of ${rows.length} rostered today`, feature: true },
    { href: "#/attendance", label: "Late or absent", value: late, note: "Today" },
    { href: "#/control", label: "Missed patrols", value: patrolAlerts, note: "Alerts today" },
    { href: "#/incidents", label: "Open incidents", value: incidents.length, note: `${incidents.filter((i) => i.severity === "high" || i.severity === "critical").length} high or critical` },
    { href: "#/compliance", label: "Expiring licences", value: expiringDocs.length, note: blocked ? `${blocked} officer${blocked === 1 ? "" : "s"} blocked` : "Within 60 days" },
  ];

  return (
    <>
      {header}
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <nav aria-label="Today's figures" className="grid grid-cols-2 gap-px md:grid-cols-3 xl:grid-cols-5">
          {counters.map((c) => (
            <a
              key={c.label}
              href={c.href}
              className={`group block p-5 sm:p-6 ${c.feature ? "on-dark bg-electric-blue text-paper" : "border-hairline bg-paper text-ink hover:bg-surface-alt border"}`}
            >
              <span className={`text-caption block ${c.feature ? "text-paper/85" : "text-stone"}`}>{c.label}</span>
              <span className="text-h2 mt-3 block leading-none tabular-nums">{c.value}</span>
              <span className={`text-micro mt-3 block underline-offset-4 group-hover:underline ${c.feature ? "text-paper/85" : "text-stone"}`}>{c.note}</span>
            </a>
          ))}
        </nav>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="Sites today" action={<a href="#/rota" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">Rota</a>} flush>
            {siteLines.length === 0 ? (
              <Empty>No shifts today.</Empty>
            ) : (
              <Table head={["Site", "Status", "On site now", "Shifts today"]}>
                {siteLines.map((l) => (
                  <tr key={l.site_id}>
                    <td className={td}>
                      <a href={`#/sites/${l.site_id}`} className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                        {l.site_name}
                      </a>
                    </td>
                    <td className={td}>
                      <Status tone={l.tone} wrap>
                        {l.reason}
                      </Status>
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {l.onSite}
                      {l.required ? ` / ${l.required}` : ""}
                    </td>
                    <td className={`${td} tabular-nums`}>{l.shifts.map((s) => `${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`).join(", ")}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>

          <Panel title="Alerts" action={<a href="#/control" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">Control room</a>} flush>
            {alerts.length === 0 ? (
              <Empty>No open alerts.</Empty>
            ) : (
              <ul className="divide-hairline divide-y">
                {alerts.slice(0, 12).map((a) => (
                  <li key={a.id}>
                    <a href="#/control" className="hover:bg-surface-alt block px-6 py-4">
                      <Status tone={a.kind === "panic" ? "bad" : "warn"} wrap>
                        {ALERT_LABEL[a.kind]} · {a.officer_name}
                      </Status>
                      <span className="text-micro text-stone mt-1 block pl-4 tabular-nums">
                        {fmtTime(a.created_at)}
                        {a.site_name ? ` · ${a.site_name}` : ""}
                        {a.acknowledged_at ? " · seen" : " · not yet seen"}
                      </span>
                    </a>
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
