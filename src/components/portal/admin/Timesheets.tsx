import { Fragment, useCallback, useEffect, useState, type SyntheticEvent } from "react";
import type { Profile } from "../../../lib/portalSupabase";
import { Field, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField } from "../ui";
import { addDays, isoDate, listOfficers, weekStart, type Officer } from "./adminData";
import { Empty, Page, PageHeader, Panel, Status, td, th } from "./kit";
import {
  addPayslip,
  approveHours,
  deletePayslip,
  downloadCsv,
  listPayRates,
  listPayslips,
  listTimesheets,
  rateOn,
  type PayRate,
  type PayslipRow,
  type TimesheetRow,
} from "./opsData";
import { punctuality } from "../officers/data";

/**
 * Timesheets: one week, grouped by officer with weekly totals. Each shift
 * shows clocked times and flags — LATE (clocked in more than 5 minutes
 * after the start), SHORT (clocked hours more than 15 minutes under the
 * booked length), OFF SITE (a clock in/out made away from the site or
 * with no location). Approve as clocked, or edit the hours with a
 * required reason (kept with the approval and in the audit log).
 * "Export CSV" gives one line per shift with approved hours, rate and
 * pay, ready for Xero or a payroll import. Payslip links below.
 */

const clockedMinutes = (r: TimesheetRow) => (r.first_in && r.last_out ? Math.max(0, Math.round((Date.parse(r.last_out) - Date.parse(r.first_in)) / 60_000)) : null);
const bookedMinutes = (r: TimesheetRow) => Math.round((Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60_000);
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

function flags(r: TimesheetRow): { tone: "warn" | "bad"; label: string }[] {
  const out: { tone: "warn" | "bad"; label: string }[] = [];
  if (!r.first_in) return Date.parse(r.ends_at) < Date.now() ? [{ tone: "bad", label: "No clock-in" }] : [];
  const late = punctuality({ type: "in", schedule_offset_min: r.in_offset });
  if (late && (r.in_offset ?? 0) > 0) out.push({ tone: "warn", label: late });
  const c = clockedMinutes(r);
  if (c == null) out.push({ tone: "warn", label: "No clock-out" });
  else if (c < bookedMinutes(r) - 15) out.push({ tone: "warn", label: `Short ${hm(bookedMinutes(r) - c)}` });
  if (r.off_site) out.push({ tone: "bad", label: "Off site" });
  return out;
}

export default function Timesheets({ profile }: { profile: Profile }) {
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [rows, setRows] = useState<TimesheetRow[] | null>(null);
  const [rates, setRates] = useState<PayRate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([listTimesheets(week.toISOString(), addDays(week, 7).toISOString()), listPayRates()]);
      setRows(t);
      setRates(r);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load timesheets.");
    }
  }, [week]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const clean = rows?.filter((r) => r.approved_minutes == null && clockedMinutes(r) != null && flags(r).length === 0) ?? [];
  const totalApproved = rows?.reduce((n, r) => n + (r.approved_minutes ?? 0), 0) ?? 0;
  const groups = new Map<string, TimesheetRow[]>();
  for (const r of rows ?? []) groups.set(r.guard_id, [...(groups.get(r.guard_id) ?? []), r]);

  async function approveClean() {
    if (!confirm(`Approve ${clean.length} shift${clean.length === 1 ? "" : "s"} with no flags, as clocked?`)) return;
    setBusy(true);
    try {
      for (const r of clean) await approveHours(r.assignment_id, profile.id, clockedMinutes(r)!, null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Some approvals failed.");
    }
    setBusy(false);
  }

  function exportCsv() {
    if (!rows) return;
    const lines: (string | number | null)[][] = [["Officer", "Date", "Site", "Booked start", "Booked end", "Clocked in", "Clocked out", "Clocked hours", "Approved hours", "Hourly rate (GBP)", "Pay (GBP)", "Flags", "Approval note"]];
    for (const r of rows) {
      const date = isoDate(new Date(r.starts_at));
      const rate = rateOn(rates, r.guard_id, date);
      const approved = r.approved_minutes != null ? r.approved_minutes / 60 : null;
      const c = clockedMinutes(r);
      lines.push([
        r.officer_name,
        date,
        r.site_name,
        fmtTime(r.starts_at),
        fmtTime(r.ends_at),
        r.first_in ? fmtTime(r.first_in) : "",
        r.last_out ? fmtTime(r.last_out) : "",
        c != null ? (c / 60).toFixed(2) : "",
        approved != null ? approved.toFixed(2) : "",
        rate != null ? rate.toFixed(2) : "",
        approved != null && rate != null ? (approved * rate).toFixed(2) : "",
        flags(r).map((f) => f.label).join("; "),
        r.approval_note ?? "",
      ]);
    }
    downloadCsv(`timesheets-${isoDate(week)}.csv`, lines);
  }

  return (
    <>
      <PageHeader
        title="Timesheets"
        subtitle={`${fmtShortDay(week.toISOString())} – ${fmtShortDay(addDays(week, 6).toISOString())} · ${hm(totalApproved)} approved`}
        actions={
          <>
            <div className="border-hairline bg-paper flex border">
              <button type="button" className="text-caption hover:bg-surface-alt min-h-11 px-4" onClick={() => setWeek(addDays(week, -7))}>
                Previous
              </button>
              <button type="button" className="text-caption border-hairline hover:bg-surface-alt min-h-11 border-x px-4" onClick={() => setWeek(weekStart(new Date()))}>
                This week
              </button>
              <button type="button" className="text-caption hover:bg-surface-alt min-h-11 px-4" onClick={() => setWeek(addDays(week, 7))}>
                Next
              </button>
            </div>
            <PortalButton tone="quiet" className="min-h-11 px-5" disabled={!rows?.length} onClick={exportCsv}>
              Export CSV
            </PortalButton>
            {clean.length > 0 && (
              <PortalButton className="min-h-11 px-5" disabled={busy} onClick={approveClean}>
                Approve {clean.length} unflagged
              </PortalButton>
            )}
          </>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!rows ? (
            <Loading />
          ) : rows.length === 0 ? (
            <Empty>No confirmed shifts this week.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead className="border-hairline border-b">
                  <tr>
                    {["Shift", "In", "Out", "Clocked", "Flags", "Approved"].map((h) => (
                      <th key={h} scope="col" className={th}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...groups.values()].map((list) => {
                    const clocked = list.reduce((n, r) => n + (clockedMinutes(r) ?? 0), 0);
                    const approved = list.reduce((n, r) => n + (r.approved_minutes ?? 0), 0);
                    return (
                      <Fragment key={list[0].guard_id}>
                        <tr className="bg-surface-alt border-hairline border-y">
                          <th scope="rowgroup" colSpan={3} className="text-caption text-ink px-6 py-3 text-left font-normal">
                            <a href={`#/officers/${list[0].guard_id}`} className="underline decoration-hairline underline-offset-4 hover:decoration-ink">
                              {list[0].officer_name}
                            </a>
                          </th>
                          <td className="text-caption text-ink px-6 py-3 tabular-nums">{hm(clocked)}</td>
                          <td className="text-caption text-stone px-6 py-3">{list.reduce((n, r) => n + flags(r).length, 0) || "—"}</td>
                          <td className="text-caption text-ink px-6 py-3 tabular-nums">{hm(approved)}</td>
                        </tr>
                        {list.map((r) => (
                          <Row key={r.assignment_id} r={r} adminId={profile.id} onChanged={load} />
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <PayslipManager />
      </Page>
    </>
  );
}

function Row({ r, adminId, onChanged }: { r: TimesheetRow; adminId: string; onChanged: () => Promise<void> }) {
  const clocked = clockedMinutes(r);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = flags(r);
  const link = "text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink";

  async function save(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const m = String(form.get("hm") ?? "").match(/^(\d{1,2}):(\d{2})$/);
    const reason = String(form.get("note") ?? "").trim();
    if (!m) return setError("Enter hours as h:mm, e.g. 7:45.");
    if (!reason) return setError("Give a reason for the change.");
    setBusy(true);
    setError(null);
    try {
      await approveHours(r.assignment_id, adminId, Number(m[1]) * 60 + Number(m[2]), reason);
      setEditing(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    }
    setBusy(false);
  }

  return (
    <tr className="border-hairline border-b">
      <td className={`${td} whitespace-nowrap`}>
        {fmtShortDay(r.starts_at)} · {fmtTime(r.starts_at)}–{fmtTime(r.ends_at)}
        <span className="text-micro text-stone block">{r.site_name}</span>
      </td>
      <td className={`${td} tabular-nums`}>{r.first_in ? fmtTime(r.first_in) : "—"}</td>
      <td className={`${td} tabular-nums`}>{r.last_out ? fmtTime(r.last_out) : "—"}</td>
      <td className={`${td} tabular-nums`}>{clocked != null ? hm(clocked) : "—"}</td>
      <td className={td}>
        {f.length === 0 ? (
          <span className="text-stone">—</span>
        ) : (
          <span className="flex flex-col gap-1">
            {f.map((x) => (
              <Status key={x.label} tone={x.tone}>
                {x.label}
              </Status>
            ))}
          </span>
        )}
      </td>
      <td className={td}>
        {editing ? (
          <form onSubmit={save} className="flex flex-wrap items-end gap-2" noValidate>
            <div className="w-24">
              <Field label="Hours" id={`hm-${r.assignment_id}`} name="hm" defaultValue={hm(r.approved_minutes ?? clocked ?? bookedMinutes(r))} />
            </div>
            <div className="w-48">
              <Field label="Reason" id={`n-${r.assignment_id}`} name="note" defaultValue={r.approval_note ?? ""} placeholder="e.g. Forgot to clock out" />
            </div>
            <PortalButton type="submit" className="min-h-12 px-4" disabled={busy}>
              Save
            </PortalButton>
            <button type="button" className={link} onClick={() => setEditing(false)}>
              Cancel
            </button>
            {error && (
              <div className="w-full">
                <Notice kind="error">{error}</Notice>
              </div>
            )}
          </form>
        ) : r.approved_minutes != null ? (
          <span className="flex flex-wrap items-center gap-3">
            <Status tone="good">{hm(r.approved_minutes)}</Status>
            {r.approval_note && <span className="text-micro text-stone">{r.approval_note}</span>}
            <button type="button" className={link} onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className={link}
              onClick={async () => {
                await approveHours(r.assignment_id, adminId, null, null);
                await onChanged();
              }}
            >
              Undo
            </button>
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-3">
            {clocked != null && (
              <PortalButton
                className="min-h-10 px-4"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await approveHours(r.assignment_id, adminId, clocked, null).catch((e) => setError(e.message));
                  await onChanged();
                  setBusy(false);
                }}
              >
                Approve
              </PortalButton>
            )}
            <button type="button" className={link} onClick={() => setEditing(true)}>
              Edit with reason
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

function PayslipManager() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [guardId, setGuardId] = useState("");
  const [list, setList] = useState<PayslipRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listOfficers()
      .then((o) => setOfficers(o.filter((x) => x.active)))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!guardId) return setList(null);
    setList(await listPayslips(guardId).catch(() => []));
  }, [guardId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const url = String(f.get("url") ?? "").trim();
    const period_end = String(f.get("end") ?? "");
    const period_label = String(f.get("label") ?? "").trim();
    if (!/^https:\/\//.test(url)) return setError("The link must start with https://");
    if (!period_end || !period_label) return setError("Add the pay period and its end date.");
    setBusy(true);
    setError(null);
    try {
      await addPayslip({ guard_id: guardId, url, period_end, period_label });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add.");
    }
    setBusy(false);
  }

  return (
    <Panel title="Payslip links">
      <p className="text-caption text-stone">Paste the link to each payslip from your payroll provider. Officers see their own under Payslips.</p>
      <div className="mt-5 max-w-sm">
        <SelectField label="Officer" id="ps-officer" value={guardId} onChange={(e) => setGuardId(e.target.value)}>
          <option value="">Choose an officer</option>
          {officers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.full_name || o.email}
            </option>
          ))}
        </SelectField>
      </div>
      {guardId && (
        <>
          <form onSubmit={add} className="mt-6 grid gap-4 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end" noValidate>
            <Field label="Pay period" id="ps-label" name="label" placeholder="e.g. September 2026" />
            <Field label="Period ends" id="ps-end" name="end" type="date" />
            <Field label="Link" id="ps-url" name="url" placeholder="https://" />
            <PortalButton type="submit" disabled={busy}>
              Add
            </PortalButton>
          </form>
          {error && (
            <div className="mt-4">
              <Notice kind="error">{error}</Notice>
            </div>
          )}
          {list && (
            <ul className="divide-hairline border-hairline mt-6 divide-y border">
              {list.length === 0 && <li className="text-caption text-stone px-4 py-3">No payslips yet.</li>}
              {list.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-caption text-ink underline underline-offset-4">
                    {p.period_label}
                  </a>
                  <button
                    type="button"
                    className="text-caption text-ink underline decoration-magenta underline-offset-4"
                    onClick={async () => {
                      if (!confirm(`Remove the ${p.period_label} payslip link?`)) return;
                      await deletePayslip(p.id);
                      await load();
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
