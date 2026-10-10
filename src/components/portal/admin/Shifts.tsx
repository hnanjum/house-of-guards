import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Field, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { IconPlus } from "./icons";
import {
  addDays,
  createShift,
  deleteShift,
  isoDate,
  listOfficers,
  listShifts,
  listSites,
  localToIso,
  offerShift,
  setAssignmentStatus,
  startOfToday,
  weekStart,
  type Officer,
  type ShiftRow,
  type SiteRow,
} from "./adminData";
import { Empty, Page, PageHeader, Panel, Status } from "./kit";

/**
 * Shifts: one week at a time, grouped by day. Each shift shows its cover
 * (confirmed / required) and officers with their reply; it can be offered
 * to more officers, have an officer cancelled, or be deleted (only while
 * it has no attendance records). "New shift" opens an inline form; an
 * end time earlier than the start time means the shift runs overnight.
 */

const STATUS = {
  offered: { tone: "warn" as const, label: "Offered" },
  accepted: { tone: "good" as const, label: "Confirmed" },
  declined: { tone: "bad" as const, label: "Declined" },
  cancelled: { tone: "idle" as const, label: "Cancelled" },
};

export default function Shifts() {
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(() => window.location.hash === "#/shifts/new");

  const load = useCallback(async () => {
    try {
      const [s, si, of] = await Promise.all([
        listShifts(week.toISOString(), addDays(week, 7).toISOString()),
        listSites(),
        listOfficers(),
      ]);
      setShifts(s);
      setSites(si.filter((x) => x.active));
      setOfficers(of.filter((o) => o.active));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load shifts.");
    }
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const label = `${fmtShortDay(week.toISOString())} – ${fmtShortDay(addDays(week, 6).toISOString())}`;

  return (
    <>
      <PageHeader
        title="Shifts"
        subtitle={label}
        actions={
          <>
            <div className="border-hairline bg-paper flex border">
              <button type="button" className="text-caption hover:bg-surface-alt min-h-11 px-4" onClick={() => setWeek(addDays(week, -7))}>
                Previous
              </button>
              <button
                type="button"
                className="text-caption border-hairline hover:bg-surface-alt min-h-11 border-x px-4"
                onClick={() => setWeek(weekStart(new Date()))}
              >
                This week
              </button>
              <button type="button" className="text-caption hover:bg-surface-alt min-h-11 px-4" onClick={() => setWeek(addDays(week, 7))}>
                Next
              </button>
            </div>
            <PortalButton onClick={() => setCreating(true)} className="min-h-11 gap-2 px-5">
              <IconPlus width={16} height={16} />
              New shift
            </PortalButton>
          </>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}

        {creating && (
          <NewShift
            sites={sites}
            onClose={() => {
              setCreating(false);
              if (window.location.hash === "#/shifts/new") history.replaceState(null, "", "#/shifts");
            }}
            onSaved={load}
          />
        )}

        {!shifts ? (
          <Loading label="Loading shifts" />
        ) : (
          days.map((d) => {
            const list = shifts.filter((s) => isoDate(new Date(s.starts_at)) === isoDate(d));
            return (
              <Panel key={d.toISOString()} title={fmtShortDay(d.toISOString())} flush>
                {list.length === 0 ? (
                  <Empty>No shifts.</Empty>
                ) : (
                  <ul className="divide-hairline divide-y">
                    {list.map((s) => (
                      <ShiftItem key={s.id} shift={s} officers={officers} onChanged={load} />
                    ))}
                  </ul>
                )}
              </Panel>
            );
          })
        )}
      </Page>
    </>
  );
}

function NewShift({ sites, onClose, onSaved }: { sites: SiteRow[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const date = String(f.get("date"));
    const start = localToIso(date, String(f.get("start")));
    let end = localToIso(date, String(f.get("end")));
    if (Date.parse(end) <= Date.parse(start)) end = new Date(Date.parse(end) + 86_400_000).toISOString(); // overnight
    setBusy(true);
    setError(null);
    try {
      await createShift({
        site_id: String(f.get("site")),
        starts_at: start,
        ends_at: end,
        guards_required: Math.max(1, Number(f.get("required")) || 1),
        notes: String(f.get("notes") ?? "").trim() || null,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the shift.");
      setBusy(false);
    }
  }

  return (
    <Panel title="New shift">
      {sites.length === 0 ? (
        <p className="text-body text-stone">
          Add a site first. <a href="#/sites" className="text-ink underline underline-offset-4">Go to sites</a>
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2">
            <SelectField label="Site" id="site" name="site" required defaultValue="">
              <option value="" disabled>
                Choose a site
              </option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </div>
          <Field label="Date" id="date" name="date" type="date" required defaultValue={isoDate(startOfToday())} />
          <Field label="Officers needed" id="required" name="required" type="number" min={1} max={50} defaultValue={1} required />
          <Field label="Start" id="start" name="start" type="time" required defaultValue="07:00" />
          <Field label="End" id="end" name="end" type="time" required defaultValue="19:00" hint="Earlier than start = overnight." />
          <div className="md:col-span-2">
            <TextArea label="Notes for officers (optional)" id="notes" name="notes" rows={2} />
          </div>
          {error && (
            <div className="md:col-span-2 xl:col-span-4">
              <Notice kind="error">{error}</Notice>
            </div>
          )}
          <div className="flex gap-3 md:col-span-2 xl:col-span-4">
            <PortalButton type="submit" disabled={busy}>
              {busy ? "Saving" : "Create shift"}
            </PortalButton>
            <PortalButton tone="quiet" onClick={onClose}>
              Cancel
            </PortalButton>
          </div>
        </form>
      )}
    </Panel>
  );
}

function ShiftItem({ shift, officers, onChanged }: { shift: ShiftRow; officers: Officer[]; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = shift.assignments.filter((a) => a.status !== "cancelled");
  const confirmed = live.filter((a) => a.status === "accepted").length;
  const taken = new Set(live.filter((a) => a.status !== "declined").map((a) => a.guard_id));
  const available = officers.filter((o) => !taken.has(o.id));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
    setBusy(false);
  }

  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <span className="text-caption text-ink w-28 tabular-nums">
          {fmtTime(shift.starts_at)} – {fmtTime(shift.ends_at)}
        </span>
        <span className="text-caption text-ink min-w-40 flex-1">{shift.site_name}</span>
        <Status tone={confirmed >= shift.guards_required ? "good" : "warn"}>
          {confirmed}/{shift.guards_required} confirmed
        </Status>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
        >
          {open ? "Close" : "Manage"}
        </button>
      </div>

      {live.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 sm:pl-36">
          {live.map((a) => (
            <li key={a.id} className="flex items-center gap-2">
              <span className="text-caption text-ink">{a.officer_name}</span>
              <Status tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Status>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="border-hairline mt-4 space-y-5 border-t pt-5 sm:pl-36">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const id = String(new FormData(e.currentTarget).get("officer") ?? "");
              if (id) run(() => offerShift(shift.id, id));
            }}
          >
            <div className="min-w-64">
              <SelectField label="Offer to officer" id={`o-${shift.id}`} name="officer" defaultValue="" required>
                <option value="" disabled>
                  {available.length ? "Choose an officer" : "No officers available"}
                </option>
                {available.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name || o.email}
                  </option>
                ))}
              </SelectField>
            </div>
            <PortalButton type="submit" disabled={busy || !available.length}>
              Send offer
            </PortalButton>
          </form>

          {live.length > 0 && (
            <ul className="space-y-2">
              {live
                .filter((a) => a.status !== "declined")
                .map((a) => (
                  <li key={a.id} className="flex items-center gap-4">
                    <span className="text-caption text-ink">{a.officer_name}</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(() => setAssignmentStatus(a.id, "cancelled"))}
                      className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:opacity-50"
                    >
                      Remove from shift
                    </button>
                  </li>
                ))}
            </ul>
          )}

          {shift.notes && <p className="text-caption text-stone whitespace-pre-line">Notes: {shift.notes}</p>}

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (confirm(`Delete the ${fmtTime(shift.starts_at)} shift at ${shift.site_name}?`)) run(() => deleteShift(shift.id));
            }}
            className="text-caption text-ink underline decoration-magenta underline-offset-4 disabled:opacity-50"
          >
            Delete shift
          </button>

          {error && <Notice kind="error">{error}</Notice>}
        </div>
      )}
    </li>
  );
}
