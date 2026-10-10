import { useEffect, useState } from "react";
import type { Assignment, ClockEvent } from "../../../lib/portalSupabase";
import { fmtShortDay, fmtTime, Loading, Notice } from "../ui";
import { addDays, isoDate, startOfToday, ukToInstant, weekStart } from "../admin/adminData";
import { Empty, Page, PageHeader, Panel, Stat, Status, Table, td } from "../admin/kit";
import { hoursFor, loadClockEvents, loadWorked } from "./data";

/**
 * Timesheet: shifts worked in a period with clocked times, clocked hours
 * and the hours the office has approved for pay. The times are the
 * server's, the same record the office and client see.
 */

type Period = "this-week" | "last-week" | "this-month" | "last-month";

function range(p: Period): { from: Date; to: Date; label: string } {
  const now = new Date();
  const wk = weekStart(now);
  const [y, m] = isoDate(now).split("-").map(Number);
  const monthStart = (yy: number, mm: number) => ukToInstant(`${yy}-${String(mm).padStart(2, "0")}-01`);
  switch (p) {
    case "this-week":
      return { from: wk, to: addDays(wk, 7), label: "This week" };
    case "last-week":
      return { from: addDays(wk, -7), to: wk, label: "Last week" };
    case "this-month":
      return { from: monthStart(y, m), to: addDays(startOfToday(), 1), label: "This month" };
    case "last-month": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: monthStart(py, pm), to: monthStart(y, m), label: "Last month" };
    }
  }
}

const PERIODS: Period[] = ["this-week", "last-week", "this-month", "last-month"];

export default function Timesheet({ officerId }: { officerId: string }) {
  const [period, setPeriod] = useState<Period>("this-week");
  const [data, setData] = useState<{ list: Assignment[]; ev: Record<string, ClockEvent[]> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    const r = range(period);
    loadWorked(officerId, r.from, r.to < new Date() ? r.to : new Date())
      .then(async (list) => {
        setData({ list, ev: await loadClockEvents(list.map((a) => a.id)) });
        setError(null);
      })
      .catch(() => setError("Your timesheet couldn't be loaded."));
  }, [period, officerId]);

  const total = data ? data.list.reduce((n, a) => n + (hoursFor(data.ev[a.id]) ?? 0), 0) : 0;
  const worked = data ? data.list.filter((a) => hoursFor(data.ev[a.id]) != null).length : 0;
  const approved = data ? data.list.reduce((n, a) => n + (a.approved_minutes ?? 0), 0) / 60 : 0;
  const awaiting = data ? data.list.filter((a) => hoursFor(data.ev[a.id]) != null && a.approved_minutes == null).length : 0;
  const seg = (on: boolean) => `text-caption min-h-11 px-3 sm:px-4 ${on ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-surface-alt"}`;

  return (
    <>
      <PageHeader
        offset={false}
        title="Timesheet"
        actions={
          <div className="border-hairline flex flex-wrap border" role="group" aria-label="Period">
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={period === p} className={seg(period === p)} onClick={() => setPeriod(p)}>
                {range(p).label}
              </button>
            ))}
          </div>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="grid grid-cols-2 gap-px xl:grid-cols-3">
          <Stat feature label="Hours clocked" value={(Math.round(total * 10) / 10).toFixed(1)} note={range(period).label} />
          <Stat label="Hours approved" value={(Math.round(approved * 10) / 10).toFixed(1)} note={awaiting ? `${awaiting} shift${awaiting === 1 ? "" : "s"} awaiting approval` : "All approved"} />
          <Stat label="Shifts completed" value={worked} note={data ? `of ${data.list.length} booked` : undefined} />
        </div>
        <Panel flush>
          {!data ? (
            <Loading />
          ) : data.list.length === 0 ? (
            <Empty>No shifts in this period.</Empty>
          ) : (
            <Table head={["Date", "Site", "Booked", "In", "Out", "Hours", "Approved"]}>
              {data.list.map((a) => {
                const ev = data.ev[a.id] ?? [];
                const inE = ev.find((e) => e.type === "in");
                const outE = [...ev].reverse().find((e) => e.type === "out");
                const h = hoursFor(ev);
                return (
                  <tr key={a.id}>
                    <td className={`${td} whitespace-nowrap`}>{fmtShortDay(a.shift.starts_at)}</td>
                    <td className={td}>{a.shift.site.name}</td>
                    <td className={`${td} whitespace-nowrap tabular-nums`}>
                      {fmtTime(a.shift.starts_at)} – {fmtTime(a.shift.ends_at)}
                    </td>
                    <td className={`${td} tabular-nums`}>{inE ? fmtTime(inE.server_time) : "—"}</td>
                    <td className={`${td} tabular-nums`}>{outE ? fmtTime(outE.server_time) : "—"}</td>
                    <td className={`${td} tabular-nums`}>
                      {h != null ? (Math.round(h * 100) / 100).toFixed(2) : inE ? <Status tone="warn">No clock-out</Status> : <Status tone="bad">Not worked</Status>}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {a.approved_minutes != null ? (Math.round((a.approved_minutes / 60) * 100) / 100).toFixed(2) : h != null ? <Status tone="idle">Pending</Status> : "—"}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
        <p className="text-micro text-stone">If a time looks wrong, contact the office. Clock records can't be changed from the app.</p>
      </Page>
    </>
  );
}
