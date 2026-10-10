import { useCallback, useEffect, useState } from "react";
import { fmtDistance, fmtShortDay, fmtTime, Loading, Notice } from "../ui";
import { addDays, listClockEvents, startOfToday, type ClockRow } from "./adminData";
import { Empty, Page, PageHeader, Panel, Status, Table, td } from "./kit";

/**
 * Attendance log: every clock in/out with where it was made from. The
 * server's time is the record; if the phone's own clock differed by more
 * than five minutes (e.g. an offline or tampered device) that is shown.
 */

const RANGES = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

export default function Attendance() {
  const [days, setDays] = useState(7);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [rows, setRows] = useState<ClockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await listClockEvents(addDays(startOfToday(), 1 - days).toISOString()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load attendance.");
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  const flagged = (r: ClockRow) => r.within_geofence !== true || drift(r) > 5;
  const shown = rows?.filter((r) => !flaggedOnly || flagged(r)) ?? [];

  const seg = (active: boolean) =>
    `text-caption min-h-11 px-4 ${active ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-surface-alt"}`;

  return (
    <>
      <PageHeader
        title="Attendance"
        subtitle={rows ? `${rows.length} clock event${rows.length === 1 ? "" : "s"}, ${rows.filter(flagged).length} flagged` : undefined}
        actions={
          <>
            <div className="border-hairline flex border" role="group" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r.days} type="button" aria-pressed={days === r.days} className={seg(days === r.days)} onClick={() => setDays(r.days)}>
                  {r.label}
                </button>
              ))}
            </div>
            <div className="border-hairline flex border" role="group" aria-label="Filter">
              <button type="button" aria-pressed={!flaggedOnly} className={seg(!flaggedOnly)} onClick={() => setFlaggedOnly(false)}>
                All
              </button>
              <button type="button" aria-pressed={flaggedOnly} className={seg(flaggedOnly)} onClick={() => setFlaggedOnly(true)}>
                Flagged
              </button>
            </div>
          </>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!rows ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty>{flaggedOnly ? "Nothing flagged in this period." : "No clock-ins in this period."}</Empty>
          ) : (
            <Table head={["When", "Officer", "Site", "Event", "Location", "Phone clock"]}>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className={`${td} whitespace-nowrap tabular-nums`}>
                    {fmtShortDay(r.server_time)} · {fmtTime(r.server_time)}
                  </td>
                  <td className={td}>{r.officer_name}</td>
                  <td className={td}>{r.site_name}</td>
                  <td className={td}>Clock {r.type}</td>
                  <td className={td}>
                    {r.within_geofence === true ? (
                      <Status tone="good">On site</Status>
                    ) : r.within_geofence === false ? (
                      <Status tone="bad">{r.distance_to_site_m != null ? `${fmtDistance(r.distance_to_site_m)} away` : "Away"}</Status>
                    ) : (
                      <Status tone="warn">No location</Status>
                    )}
                  </td>
                  <td className={td}>
                    {drift(r) > 5 ? <Status tone="warn">{Math.round(drift(r))} min off</Status> : <span className="text-stone">Matches</span>}
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

/** Minutes between the phone's clock and the server's at the moment of clocking. */
function drift(r: ClockRow) {
  return Math.abs(Date.parse(r.server_time) - Date.parse(r.device_time)) / 60_000;
}
