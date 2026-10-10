import { useEffect, useState } from "react";
import type { Assignment, ClockEvent } from "../../../lib/portalSupabase";
import { fmtShortDay, fmtTime, Loading } from "../ui";
import { addDays, isoDate, startOfToday } from "../admin/adminData";
import { Empty, Page, PageHeader, Panel } from "../admin/kit";
import { dutyState, hoursFor, loadClockEvents, loadWorked } from "./data";
import { ShiftRow } from "./OfficerHome";

/**
 * My shifts: Upcoming (offered and accepted, grouped by day) and Past
 * (the last 30 days of accepted shifts, with clocked hours).
 */
export default function MyShifts({
  officerId,
  assignments,
  events,
}: {
  officerId: string;
  assignments: Assignment[] | null;
  events: Record<string, ClockEvent[]>;
  onChanged: () => Promise<void>;
}) {
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [past, setPast] = useState<{ list: Assignment[]; ev: Record<string, ClockEvent[]> } | null>(null);

  useEffect(() => {
    if (tab !== "past" || past) return;
    loadWorked(officerId, addDays(startOfToday(), -30), new Date())
      .then(async (list) => setPast({ list, ev: await loadClockEvents(list.map((a) => a.id)) }))
      .catch(() => setPast({ list: [], ev: {} }));
  }, [tab, past, officerId]);

  const seg = (on: boolean) => `text-caption min-h-11 px-4 ${on ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-surface-alt"}`;

  const upcoming = (assignments ?? []).filter((a) => a.status === "offered" || !["done", "missed"].includes(dutyState(a, events[a.id])));
  const days = [...new Set(upcoming.map((a) => isoDate(new Date(a.shift.starts_at))))];

  return (
    <>
      <PageHeader
        offset={false}
        title="My shifts"
        actions={
          <div className="border-hairline flex border" role="group" aria-label="Show">
            <button type="button" aria-pressed={tab === "upcoming"} className={seg(tab === "upcoming")} onClick={() => setTab("upcoming")}>
              Upcoming
            </button>
            <button type="button" aria-pressed={tab === "past"} className={seg(tab === "past")} onClick={() => setTab("past")}>
              Past 30 days
            </button>
          </div>
        }
      />
      <Page>
        {tab === "upcoming" ? (
          !assignments ? (
            <Loading />
          ) : days.length === 0 ? (
            <Panel flush>
              <Empty>No upcoming shifts.</Empty>
            </Panel>
          ) : (
            days.map((d) => {
              const list = upcoming.filter((a) => isoDate(new Date(a.shift.starts_at)) === d);
              return (
                <Panel key={d} title={fmtShortDay(list[0].shift.starts_at)} flush>
                  <ul className="divide-hairline divide-y">
                    {list.map((a) => (
                      <li key={a.id}>
                        <ShiftRow
                          a={a}
                          note={
                            a.status === "offered"
                              ? "Awaiting your reply"
                              : dutyState(a, events[a.id]) === "on-duty"
                                ? "On duty now"
                                : undefined
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </Panel>
              );
            })
          )
        ) : !past ? (
          <Loading />
        ) : past.list.length === 0 ? (
          <Panel flush>
            <Empty>No shifts in the last 30 days.</Empty>
          </Panel>
        ) : (
          <Panel flush>
            <ul className="divide-hairline divide-y">
              {past.list.map((a) => {
                const h = hoursFor(past.ev[a.id]);
                const first = past.ev[a.id]?.find((e) => e.type === "in");
                return (
                  <li key={a.id}>
                    <ShiftRow
                      a={a}
                      note={h != null ? `${(Math.round(h * 10) / 10).toFixed(1)} h worked` : first ? `Clocked in ${fmtTime(first.server_time)}` : "No clock-in"}
                    />
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
      </Page>
    </>
  );
}
