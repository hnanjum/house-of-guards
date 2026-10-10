import { useCallback, useEffect, useState } from "react";
import { fmtDay, fmtDistance, fmtTime, Loading, Notice } from "../ui";
import { IconPlus } from "./icons";
import { addDays, attendance, listClockEvents, listShifts, startOfToday, type ClockRow, type ShiftRow } from "./adminData";
import { Empty, LinkButton, Page, PageHeader, Panel, Stat, Status, Table, td } from "./kit";

/**
 * Today at a glance: four headline figures (the live one in Electric
 * Blue), today's shifts with each officer's attendance, a "needs
 * attention" list, and the latest clock events. Refreshes every minute.
 */

type Att = ReturnType<typeof attendance>;

const ATT: Record<Att, { tone: "good" | "warn" | "bad" | "idle"; label: string }> = {
  "on-duty": { tone: "good", label: "On duty" },
  complete: { tone: "idle", label: "Complete" },
  late: { tone: "warn", label: "Late" },
  "no-show": { tone: "bad", label: "No show" },
  upcoming: { tone: "idle", label: "Due" },
};

export default function Overview() {
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [events, setEvents] = useState<ClockRow[]>([]);
  const [recent, setRecent] = useState<ClockRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const today = startOfToday();
      const list = await listShifts(today.toISOString(), addDays(today, 1).toISOString());
      const ids = list.flatMap((s) => s.assignments.filter((a) => a.status === "accepted").map((a) => a.id));
      const [ev, rec] = await Promise.all([
        listClockEvents(addDays(today, -1).toISOString(), ids),
        listClockEvents(addDays(today, -1).toISOString()),
      ]);
      setShifts(list);
      setEvents(ev);
      setRecent(rec.slice(0, 8));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load today's data.");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const header = (
    <PageHeader
      title="Overview"
      subtitle={fmtDay(new Date().toISOString())}
      actions={
        <LinkButton href="#/shifts/new">
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

  const rows = shifts.flatMap((s) =>
    s.assignments
      .filter((a) => a.status === "accepted")
      .map((a) => ({ shift: s, a, att: attendance(s, events.filter((e) => e.assignment_id === a.id)) })),
  );
  const onDuty = rows.filter((r) => r.att === "on-duty").length;
  const unfilled = shifts.filter((s) => s.assignments.filter((a) => a.status === "accepted").length < s.guards_required);
  const awaiting = shifts.reduce((n, s) => n + s.assignments.filter((a) => a.status === "offered").length, 0);
  const flags = recent.filter((e) => e.within_geofence !== true);

  const attention = [
    ...rows
      .filter((r) => r.att === "late" || r.att === "no-show")
      .map((r) => ({
        key: r.a.id,
        tone: r.att === "late" ? ("warn" as const) : ("bad" as const),
        title: `${r.a.officer_name} ${r.att === "late" ? "hasn't clocked in" : "didn't clock in"}`,
        detail: `${r.shift.site_name}, from ${fmtTime(r.shift.starts_at)}`,
      })),
    ...unfilled.map((s) => ({
      key: s.id,
      tone: "warn" as const,
      title: `${s.site_name} needs ${s.guards_required - s.assignments.filter((a) => a.status === "accepted").length} more`,
      detail: `${fmtTime(s.starts_at)} – ${fmtTime(s.ends_at)}`,
    })),
    ...flags.map((e) => ({
      key: e.id,
      tone: "bad" as const,
      title: `${e.officer_name} clocked ${e.type} ${e.within_geofence === false ? "away from site" : "without a location"}`,
      detail:
        e.within_geofence === false && e.distance_to_site_m != null
          ? `${fmtDistance(e.distance_to_site_m)} from ${e.site_name}, ${fmtTime(e.server_time)}`
          : `${e.site_name}, ${fmtTime(e.server_time)}`,
    })),
  ];

  return (
    <>
      {header}
      <Page>
        {error && <Notice kind="error">{error}</Notice>}

        <div className="grid grid-cols-2 gap-px xl:grid-cols-4">
          <Stat feature label="On duty now" value={onDuty} note={`of ${rows.length} rostered today`} />
          <Stat label="Shifts today" value={shifts.length} note={`${rows.length} officer${rows.length === 1 ? "" : "s"} confirmed`} />
          <Stat label="Unfilled shifts" value={unfilled.length} note={unfilled.length ? "Need officers" : "All covered"} />
          <Stat label="Awaiting reply" value={awaiting} note="Offers not yet answered" />
        </div>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Panel title="Today's shifts" action={<a href="#/shifts" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">All shifts</a>} flush>
            {shifts.length === 0 ? (
              <Empty>No shifts today.</Empty>
            ) : (
              <Table head={["Time", "Site", "Officers", "Cover"]}>
                {shifts.map((s) => {
                  const accepted = s.assignments.filter((a) => a.status === "accepted");
                  return (
                    <tr key={s.id}>
                      <td className={`${td} tabular-nums whitespace-nowrap`}>
                        {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}
                      </td>
                      <td className={td}>{s.site_name}</td>
                      <td className={td}>
                        {accepted.length === 0 ? (
                          <span className="text-stone">None confirmed</span>
                        ) : (
                          <ul className="space-y-2">
                            {accepted.map((a) => {
                              const att = rows.find((r) => r.a.id === a.id)!.att;
                              return (
                                <li key={a.id} className="flex flex-wrap items-center gap-x-3">
                                  <span>{a.officer_name}</span>
                                  <Status tone={ATT[att].tone}>{ATT[att].label}</Status>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {accepted.length}/{s.guards_required}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Panel>

          <div className="space-y-8">
            <Panel title="Needs attention" flush>
              {attention.length === 0 ? (
                <Empty>Nothing needs attention right now.</Empty>
              ) : (
                <ul className="divide-hairline divide-y">
                  {attention.map((i) => (
                    <li key={i.key} className="px-6 py-4">
                      <Status tone={i.tone} wrap>
                        {i.title}
                      </Status>
                      <p className="text-micro text-stone mt-1 pl-4">{i.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Latest activity" action={<a href="#/attendance" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">All</a>} flush>
              {recent.length === 0 ? (
                <Empty>No clock-ins yet.</Empty>
              ) : (
                <ol className="divide-hairline divide-y">
                  {recent.map((e) => (
                    <li key={e.id} className="flex items-baseline gap-4 px-6 py-3">
                      <span className="text-caption text-stone w-12 shrink-0 tabular-nums">{fmtTime(e.server_time)}</span>
                      <span className="text-caption text-ink min-w-0">
                        {e.officer_name} clocked {e.type} · <span className="text-stone">{e.site_name}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}
