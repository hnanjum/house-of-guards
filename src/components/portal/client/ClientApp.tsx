import { useCallback, useEffect, useState, type ReactNode } from "react";
import PortalShell from "../PortalShell";
import type { Profile } from "../../../lib/portalSupabase";
import { fmtDay, fmtShortDay, fmtTime, Loading, mapsUrl, Notice } from "../ui";
import { addDays, isoDate, startOfToday, weekStart } from "../admin/adminData";
import { Empty, Page, PageHeader, Panel, Stat, Status, Table, td } from "../admin/kit";
import {
  fmtHours,
  hoursWorked,
  loadMyClient,
  loadRoster,
  loadSites,
  officerState,
  type ClientSite,
  type OfficerState,
  type RosterShift,
} from "./clientData";

/**
 * Client portal (portal.harleygarrison.co.uk). Read-only view of the
 * client's own sites: who is on site now, the week's schedule, and the
 * attendance record. A lighter shell than the admin dashboard: a white
 * top bar with the colour logo, the client's company name and underline
 * tabs (Amber active mark, as on the public site's nav), then the same
 * dashboard panels on Surface Alt.
 */

const TABS = [
  { key: "", label: "Overview" },
  { key: "schedule", label: "Schedule" },
  { key: "attendance", label: "Attendance" },
  { key: "sites", label: "Sites" },
];

export default function ClientApp() {
  return (
    <PortalShell portalName="Client portal" tagline="Live cover, schedules and attendance for your sites." role="client">
      {({ profile, signOut }) => <Client profile={profile} signOut={signOut} />}
    </PortalShell>
  );
}

function useTab() {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/")[0];
  const [tab, setTab] = useState(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return tab;
}

export function Client({ profile, signOut }: { profile: Profile; signOut: () => Promise<void> }) {
  const tab = useTab();
  const [company, setCompany] = useState<string | null>(null);

  useEffect(() => {
    loadMyClient().then(setCompany).catch(() => setCompany(null));
  }, []);

  let page: ReactNode;
  if (tab === "schedule") page = <Schedule />;
  else if (tab === "attendance") page = <Attendance />;
  else if (tab === "sites") page = <Sites />;
  else page = <Overview company={company} />;

  return (
    <div className="bg-surface-alt min-h-dvh">
      <div className="border-hairline bg-paper border-b">
        <div className="flex flex-wrap items-center justify-between gap-4 px-gutter pt-4 md:px-10">
          <div className="flex items-center gap-5">
            <img src="/logo/logo-horizontal.svg" alt="Harley Garrison" width="141" height="32" className="h-8 w-auto" />
            {company && <span className="text-caption text-stone border-hairline hidden border-l pl-5 sm:inline">{company}</span>}
          </div>
          <div className="flex items-center gap-5">
            <span className="text-caption text-stone hidden md:inline">{profile.full_name}</span>
            <button type="button" onClick={signOut} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
              Sign out
            </button>
          </div>
        </div>
        <nav aria-label="Client portal" className="mt-3 overflow-x-auto px-gutter md:px-10">
          <ul className="flex gap-7">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <li key={t.key}>
                  <a
                    href={`#/${t.key}`}
                    aria-current={active ? "page" : undefined}
                    className={`text-caption inline-block border-b-2 pb-3 whitespace-nowrap transition-colors ${
                      active ? "border-amber text-ink" : "text-stone hover:text-ink border-transparent"
                    }`}
                  >
                    {t.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      <main>{page}</main>
    </div>
  );
}

const STATE: Record<OfficerState, { tone: "good" | "warn" | "bad" | "idle"; label: (s: RosterShift, o: { clock_in: string | null; clock_out: string | null }) => string }> = {
  "on-duty": { tone: "good", label: (_s, o) => `On duty since ${fmtTime(o.clock_in!)}` },
  finished: { tone: "idle", label: (_s, o) => `Finished ${fmtTime(o.clock_out!)}` },
  due: { tone: "idle", label: (s) => `Due ${fmtTime(s.starts_at)}` },
  late: { tone: "warn", label: () => "Not yet arrived" },
  missed: { tone: "bad", label: () => "Not recorded" },
};

function useRoster(from: Date, to: Date, refreshMs?: number) {
  const [data, setData] = useState<RosterShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${from.toISOString()}|${to.toISOString()}`;
  const load = useCallback(async () => {
    try {
      setData(await loadRoster(from, to));
      setError(null);
    } catch {
      setError("Your information couldn't be loaded. Check your connection and refresh.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    setData(null);
    load();
    if (!refreshMs) return;
    const t = setInterval(load, refreshMs);
    return () => clearInterval(t);
  }, [load, refreshMs]);
  return { data, error };
}

function OfficerList({ shift }: { shift: RosterShift }) {
  if (shift.officers.length === 0) return <span className="text-stone">To be confirmed</span>;
  return (
    <ul className="space-y-2">
      {shift.officers.map((o) => {
        const st = officerState(shift, o);
        return (
          <li key={o.assignment_id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{o.name}</span>
            <Status tone={STATE[st].tone}>{STATE[st].label(shift, o)}</Status>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- Overview ---------------- */

function Overview({ company }: { company: string | null }) {
  const today = startOfToday();
  const [range] = useState(() => ({ from: addDays(today, -6), to: addDays(today, 8) }));
  const { data, error } = useRoster(range.from, range.to, 60_000);

  const header = <PageHeader offset={false} title={company ?? "Overview"} subtitle={fmtDay(new Date().toISOString())} />;
  if (!data) return (<>{header}<Page>{error ? <Notice kind="error">{error}</Notice> : <Loading />}</Page></>);

  const todayKey = isoDate(today);
  const todays = data.filter((s) => isoDate(new Date(s.starts_at)) === todayKey || (Date.parse(s.starts_at) < Date.now() && Date.parse(s.ends_at) > Date.now()));
  const officersToday = todays.flatMap((s) => s.officers.map((o) => ({ s, o })));
  const onSite = officersToday.filter(({ s, o }) => officerState(s, o) === "on-duty").length;
  const required = todays.reduce((n, s) => n + s.required, 0);
  const pastWeek = data.filter((s) => Date.parse(s.starts_at) < Date.now() && Date.parse(s.starts_at) >= range.from.getTime());
  const hours = pastWeek.flatMap((s) => s.officers).reduce((n, o) => n + (hoursWorked(o) ?? 0), 0);
  const upcoming = data.filter((s) => Date.parse(s.starts_at) > Date.now() && !todays.includes(s)).slice(0, 8);

  return (
    <>
      {header}
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-px xl:grid-cols-4">
          <Stat feature label="On site now" value={onSite} note={`officer${onSite === 1 ? "" : "s"} on duty`} />
          <Stat label="Shifts today" value={todays.length} note={todays.length ? `${new Set(todays.map((s) => s.site_id)).size} site(s)` : "None scheduled"} />
          <Stat label="Cover today" value={`${officersToday.length}/${required}`} note="Officers confirmed / booked" />
          <Stat label="Hours covered" value={`${(Math.round(hours * 10) / 10).toFixed(1)} h`} note="Last 7 days, clocked" />
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="Today at your sites" flush>
            {todays.length === 0 ? (
              <Empty>No shifts at your sites today.</Empty>
            ) : (
              <>
              <ul className="divide-hairline divide-y sm:hidden">
                {todays.map((s) => (
                  <li key={s.id} className="px-6 py-4">
                    <p className="text-caption text-ink tabular-nums">
                      {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)} · {s.site_name}
                    </p>
                    <div className="text-caption text-ink mt-2">
                      <OfficerList shift={s} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="hidden sm:block">
              <Table head={["Time", "Site", "Officers"]}>
                {todays.map((s) => (
                  <tr key={s.id}>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}
                    </td>
                    <td className={td}>{s.site_name}</td>
                    <td className={td}>
                      <OfficerList shift={s} />
                    </td>
                  </tr>
                ))}
              </Table>
              </div>
              </>
            )}
          </Panel>

          <Panel title="Coming up" action={<a href="#/schedule" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">Schedule</a>} flush>
            {upcoming.length === 0 ? (
              <Empty>Nothing else booked this week.</Empty>
            ) : (
              <ul className="divide-hairline divide-y">
                {upcoming.map((s) => (
                  <li key={s.id} className="px-6 py-4">
                    <p className="text-caption text-ink">
                      {fmtShortDay(s.starts_at)} · <span className="tabular-nums">{fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}</span>
                    </p>
                    <p className="text-micro text-stone mt-1">
                      {s.site_name} · {s.officers.length}/{s.required} confirmed
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

/* ---------------- Schedule ---------------- */

function Schedule() {
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const { data, error } = useRoster(week, addDays(week, 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const seg = "text-caption hover:bg-surface-alt min-h-11 px-4";

  return (
    <>
      <PageHeader offset={false}
        title="Schedule"
        subtitle={`${fmtShortDay(week.toISOString())} – ${fmtShortDay(addDays(week, 6).toISOString())}`}
        actions={
          <div className="border-hairline bg-paper flex border">
            <button type="button" className={seg} onClick={() => setWeek(addDays(week, -7))}>Previous</button>
            <button type="button" className={`${seg} border-hairline border-x`} onClick={() => setWeek(weekStart(new Date()))}>This week</button>
            <button type="button" className={seg} onClick={() => setWeek(addDays(week, 7))}>Next</button>
          </div>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {!data ? (
          <Loading />
        ) : (
          days.map((d) => {
            const list = data.filter((s) => isoDate(new Date(s.starts_at)) === isoDate(d));
            return (
              <Panel key={d.toISOString()} title={fmtShortDay(d.toISOString())} flush>
                {list.length === 0 ? (
                  <Empty>No shifts.</Empty>
                ) : (
                  <Table head={["Time", "Site", "Cover", "Officers"]}>
                    {list.map((s) => (
                      <tr key={s.id}>
                        <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}</td>
                        <td className={td}>{s.site_name}</td>
                        <td className={`${td} tabular-nums`}>
                          <Status tone={s.officers.length >= s.required ? "good" : "warn"}>{s.officers.length}/{s.required}</Status>
                        </td>
                        <td className={td}>
                          {s.officers.length ? s.officers.map((o) => o.name).join(", ") : <span className="text-stone">To be confirmed</span>}
                        </td>
                      </tr>
                    ))}
                  </Table>
                )}
              </Panel>
            );
          })
        )}
      </Page>
    </>
  );
}

/* ---------------- Attendance ---------------- */

function Attendance() {
  const [days, setDays] = useState(7);
  const [range, setRange] = useState(() => ({ from: addDays(startOfToday(), -6), to: addDays(startOfToday(), 1) }));
  const { data, error } = useRoster(range.from, range.to);

  const rows = (data ?? [])
    .filter((s) => Date.parse(s.starts_at) <= Date.now())
    .flatMap((s) => s.officers.map((o) => ({ s, o })))
    .sort((a, b) => b.s.starts_at.localeCompare(a.s.starts_at));
  const total = rows.reduce((n, r) => n + (hoursWorked(r.o) ?? 0), 0);

  const pick = (n: number) => {
    setDays(n);
    setRange({ from: addDays(startOfToday(), 1 - n), to: addDays(startOfToday(), 1) });
  };
  const seg = (on: boolean) => `text-caption min-h-11 px-4 ${on ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-surface-alt"}`;

  return (
    <>
      <PageHeader offset={false}
        title="Attendance"
        subtitle={data ? `${fmtHours(total)} covered` : undefined}
        actions={
          <div className="border-hairline flex border" role="group" aria-label="Date range">
            {[7, 30, 90].map((n) => (
              <button key={n} type="button" aria-pressed={days === n} className={seg(days === n)} onClick={() => pick(n)}>
                {n} days
              </button>
            ))}
          </div>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!data ? (
            <Loading />
          ) : rows.length === 0 ? (
            <Empty>No attendance in this period.</Empty>
          ) : (
            <Table head={["Date", "Site", "Officer", "Booked", "Clocked in", "Clocked out", "Hours", "Location"]}>
              {rows.map(({ s, o }) => {
                const h = hoursWorked(o);
                const verified = o.clock_in_on_site === true && (o.clock_out == null || o.clock_out_on_site === true);
                return (
                  <tr key={o.assignment_id}>
                    <td className={`${td} whitespace-nowrap`}>{fmtShortDay(s.starts_at)}</td>
                    <td className={td}>{s.site_name}</td>
                    <td className={td}>{o.name}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}</td>
                    <td className={`${td} tabular-nums`}>{o.clock_in ? fmtTime(o.clock_in) : <span className="text-stone">—</span>}</td>
                    <td className={`${td} tabular-nums`}>{o.clock_out ? fmtTime(o.clock_out) : <span className="text-stone">—</span>}</td>
                    <td className={`${td} tabular-nums`}>{h != null ? fmtHours(h) : <span className="text-stone">—</span>}</td>
                    <td className={td}>
                      {o.clock_in ? <Status tone={verified ? "good" : "idle"}>{verified ? "Verified" : "Not verified"}</Status> : <span className="text-stone">—</span>}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
        <p className="text-micro text-stone">
          Times are recorded by our system when officers clock in and out. "Verified" means the officer's phone placed them at your site.
        </p>
      </Page>
    </>
  );
}

/* ---------------- Sites ---------------- */

function Sites() {
  const [sites, setSites] = useState<ClientSite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadSites().then(setSites).catch(() => setError("Your sites couldn't be loaded."));
  }, []);
  return (
    <>
      <PageHeader offset={false} title="Your sites" subtitle={sites ? `${sites.length} site${sites.length === 1 ? "" : "s"}` : undefined} />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!sites ? (
            <Loading />
          ) : sites.length === 0 ? (
            <Empty>No sites are linked to your account yet. Contact us if this looks wrong.</Empty>
          ) : (
            <Table head={["Site", "Address", ""]}>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td className={td}>{s.name}</td>
                  <td className={td}>{s.address || "—"}</td>
                  <td className={`${td} text-right`}>
                    <a href={mapsUrl(s)} target="_blank" rel="noopener noreferrer" className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                      Map
                    </a>
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
