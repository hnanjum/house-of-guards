import { useCallback, useEffect, useMemo, useState, type DragEvent, type SyntheticEvent } from "react";
import type { Profile } from "../../../lib/portalSupabase";
import { Field, fmtDay, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField, TextArea } from "../ui";
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
import { Page, PageHeader, Status } from "./kit";
import {
  compliance,
  decideRequest,
  listDocuments,
  listRequests,
  loadSiteRequirements,
  publishShifts,
  setShiftOpen,
  updateShift,
  type ComplianceResult,
  type DocumentRow,
  type RequestRow,
} from "./opsData";
import { Segmented } from "../officers/widgets";

/**
 * Rota: one week as a calendar, by site or by officer.
 *  - Drag a shift to another day to move it (same times); in the officer
 *    view, drag it onto another officer to hand it over (the first
 *    officer is taken off and the new one is offered it). Every move can
 *    also be made from the shift drawer, so the keyboard works too.
 *  - Open shifts (fewer confirmed officers than required) are marked in
 *    Magenta with the word "Open".
 *  - New shifts start as DRAFTS that officers can't see; "Publish"
 *    releases all drafts in the week.
 *  - A conflict banner lists double-booked officers, officers on a shift
 *    whose licence/required documents don't allow it, and open shifts.
 *  - The shift drawer edits everything about one shift. Its officer
 *    picker greys out anyone who isn't compliant for that site, with the
 *    reason.
 */

type View = "site" | "officer";

const DAY_MS = 86_400_000;
const overlaps = (a: ShiftRow, b: ShiftRow) => Date.parse(a.starts_at) < Date.parse(b.ends_at) && Date.parse(b.starts_at) < Date.parse(a.ends_at);
const live = (s: ShiftRow) => s.assignments.filter((a) => a.status !== "cancelled" && a.status !== "declined");
const confirmed = (s: ShiftRow) => s.assignments.filter((a) => a.status === "accepted").length;
const ukTime = (iso: string) => fmtTime(iso);

export default function Rota({ profile }: { profile: Profile }) {
  const [week, setWeek] = useState(() => weekStart(new Date()));
  const [view, setView] = useState<View>("site");
  const [shifts, setShifts] = useState<ShiftRow[] | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [reqs, setReqs] = useState<Record<string, { required_documents: string[]; requirements: string | null }>>({});
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [drawer, setDrawer] = useState<{ id: string } | { create: { date: string; site_id?: string } } | null>(() =>
    window.location.hash === "#/rota/new" ? { create: { date: isoDate(new Date()) } } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, si, of, d, rq] = await Promise.all([
        listShifts(week.toISOString(), addDays(week, 7).toISOString()),
        listSites(),
        listOfficers(),
        listDocuments(),
        loadSiteRequirements(),
      ]);
      setShifts(s);
      setSites(si.filter((x) => x.active));
      setOfficers(of.filter((o) => o.active));
      setDocs(d);
      setReqs(rq);
      setRequests(await listRequests(s.filter((x) => x.open_for_requests).map((x) => x.id)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the rota.");
    }
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  const docsBy = useMemo(() => {
    const m = new Map<string, DocumentRow[]>();
    for (const d of docs) m.set(d.guard_id, [...(m.get(d.guard_id) ?? []), d]);
    return m;
  }, [docs]);
  const complianceFor = useCallback((guardId: string, siteId: string): ComplianceResult => compliance(docsBy.get(guardId) ?? [], reqs[siteId]?.required_documents ?? []), [docsBy, reqs]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const dayKey = (iso: string) => isoDate(new Date(iso));

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
    setBusy(false);
  }

  /** Move a shift to another UK date, keeping its wall-clock times and length. */
  const moveToDay = (s: ShiftRow, date: string) =>
    run(async () => {
      const startT = ukTime(s.starts_at);
      const starts = localToIso(date, startT);
      const ends = new Date(Date.parse(starts) + (Date.parse(s.ends_at) - Date.parse(s.starts_at))).toISOString();
      await updateShift(s.id, { starts_at: starts, ends_at: ends });
    });

  const handOver = (s: ShiftRow, fromGuard: string, toGuard: string) =>
    run(async () => {
      const from = s.assignments.find((a) => a.guard_id === fromGuard && a.status !== "cancelled");
      if (from) await setAssignmentStatus(from.id, "cancelled");
      await offerShift(s.id, toGuard);
    });

  // ---- conflicts
  const conflicts: string[] = [];
  if (shifts) {
    const byGuard = new Map<string, ShiftRow[]>();
    for (const s of shifts) for (const a of live(s)) byGuard.set(a.guard_id, [...(byGuard.get(a.guard_id) ?? []), s]);
    for (const [g, list] of byGuard) {
      const name = officers.find((o) => o.id === g)?.full_name ?? "An officer";
      for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          if (overlaps(list[i], list[j]))
            conflicts.push(`${name} is booked on two overlapping shifts: ${list[i].site_name} ${fmtShortDay(list[i].starts_at)} ${fmtTime(list[i].starts_at)} and ${list[j].site_name} ${fmtTime(list[j].starts_at)}.`);
      for (const s of list) {
        const c = complianceFor(g, s.site_id);
        if (c.status === "blocked") conflicts.push(`${name} is on ${s.site_name} ${fmtShortDay(s.starts_at)} but can't work it: ${c.reasons.join(", ")}.`);
      }
    }
  }
  const open = shifts?.filter((s) => confirmed(s) < s.guards_required && Date.parse(s.ends_at) > Date.now()) ?? [];
  const drafts = shifts?.filter((s) => !s.published) ?? [];

  const selected = drawer && "id" in drawer ? shifts?.find((s) => s.id === drawer.id) : undefined;

  // ---- drag and drop
  const onDragStart = (e: DragEvent, s: ShiftRow, guardId?: string) => {
    e.dataTransfer.setData("text/plain", JSON.stringify({ id: s.id, guardId }));
    e.dataTransfer.effectAllowed = "move";
  };
  const onDrop = (e: DragEvent, date: string, rowKey: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove("bg-surface-alt");
    let payload: { id: string; guardId?: string };
    try {
      payload = JSON.parse(e.dataTransfer.getData("text/plain"));
    } catch {
      return;
    }
    const s = shifts?.find((x) => x.id === payload.id);
    if (!s) return;
    if (view === "officer" && payload.guardId && rowKey !== payload.guardId && rowKey !== "open") {
      const c = complianceFor(rowKey, s.site_id);
      if (c.status === "blocked" && !confirm(`${officers.find((o) => o.id === rowKey)?.full_name} isn't compliant: ${c.reasons.join(", ")}. Offer anyway?`)) return;
      handOver(s, payload.guardId, rowKey);
      return;
    }
    if (view === "site" && rowKey !== s.site_id && dayKey(s.starts_at) === date) {
      run(() => updateShift(s.id, { site_id: rowKey }));
      return;
    }
    if (dayKey(s.starts_at) !== date) moveToDay(s, date);
  };
  const dropProps = (date: string, rowKey: string) => ({
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      e.currentTarget.classList.add("bg-surface-alt");
    },
    onDragLeave: (e: DragEvent) => e.currentTarget.classList.remove("bg-surface-alt"),
    onDrop: (e: DragEvent) => onDrop(e, date, rowKey),
  });

  const rows: { key: string; label: string; sub?: string; tone?: "good" | "warn" | "bad" }[] =
    view === "site"
      ? sites.map((s) => ({ key: s.id, label: s.name }))
      : [
          { key: "open", label: "Open shifts", sub: "Not fully staffed" },
          ...officers.map((o) => {
            const c = compliance(docsBy.get(o.id) ?? []);
            return { key: o.id, label: o.full_name || o.email || "Officer", sub: c.status === "valid" ? "Compliant" : c.reasons[0], tone: c.status === "valid" ? ("good" as const) : c.status === "expiring" ? ("warn" as const) : ("bad" as const) };
          }),
        ];

  const cellShifts = (rowKey: string, date: string) =>
    (shifts ?? []).filter((s) => {
      if (dayKey(s.starts_at) !== date) return false;
      if (view === "site") return s.site_id === rowKey;
      if (rowKey === "open") return confirmed(s) < s.guards_required;
      return live(s).some((a) => a.guard_id === rowKey);
    });

  return (
    <>
      <PageHeader
        title="Rota"
        subtitle={`${fmtShortDay(week.toISOString())} – ${fmtShortDay(addDays(week, 6).toISOString())}`}
        actions={
          <>
            <Segmented label="View" value={view} onChange={setView} options={[{ value: "site", label: "By site" }, { value: "officer", label: "By officer" }]} />
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
            <PortalButton tone="quiet" className="min-h-11 gap-2 px-5" onClick={() => setDrawer({ create: { date: isoDate(Date.now() > week.getTime() && Date.now() < addDays(week, 7).getTime() ? new Date() : week) } })}>
              <IconPlus width={16} height={16} />
              Offer shift
            </PortalButton>
            <PortalButton
              className="min-h-11 px-5"
              disabled={busy || drafts.length === 0}
              onClick={() => {
                if (confirm(`Publish ${drafts.length} draft shift${drafts.length === 1 ? "" : "s"}? Officers will see them and any offers.`)) run(() => publishShifts(drafts.map((d) => d.id)));
              }}
            >
              Publish{drafts.length ? ` ${drafts.length}` : ""}
            </PortalButton>
          </>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {(conflicts.length > 0 || open.length > 0) && (
          <div role="status" className="border-magenta bg-paper border-l-4 px-5 py-4">
            <p className="text-caption text-ink">
              {conflicts.length > 0 ? `${conflicts.length} conflict${conflicts.length === 1 ? "" : "s"}` : "No conflicts"}
              {open.length > 0 ? ` · ${open.length} open shift${open.length === 1 ? "" : "s"} still need officers` : ""}
            </p>
            {conflicts.length > 0 && (
              <ul className="text-caption text-ink mt-2 list-disc space-y-1 pl-5">
                {conflicts.slice(0, 8).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
                {conflicts.length > 8 && <li>…and {conflicts.length - 8} more</li>}
              </ul>
            )}
          </div>
        )}

        {!shifts ? (
          <Loading label="Loading rota" />
        ) : (
          <div className="border-hairline bg-paper overflow-x-auto border">
            <table className="w-full min-w-[1000px] table-fixed border-collapse">
              <thead>
                <tr className="border-hairline border-b">
                  <th scope="col" className="text-micro text-stone w-48 px-4 py-3 text-left font-normal">
                    {view === "site" ? "Site" : "Officer"}
                  </th>
                  {days.map((d) => (
                    <th key={d.toISOString()} scope="col" className={`text-micro px-2 py-3 text-left font-normal ${isoDate(d) === isoDate(startOfToday()) ? "text-ink" : "text-stone"}`}>
                      {fmtShortDay(d.toISOString())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-hairline divide-y">
                {rows.map((r) => (
                  <tr key={r.key} className="align-top">
                    <th scope="row" className="px-4 py-3 text-left font-normal">
                      <span className="text-caption text-ink block break-words">{r.label}</span>
                      {r.sub && (r.tone ? <Status tone={r.tone} wrap>{r.sub}</Status> : <span className="text-micro text-stone block">{r.sub}</span>)}
                    </th>
                    {days.map((d) => {
                      const date = isoDate(d);
                      return (
                        <td key={date} className="border-hairline min-h-20 border-l p-1.5 transition-colors" {...dropProps(date, r.key)}>
                          <div className="space-y-1.5">
                            {cellShifts(r.key, date).map((s) => {
                              const isOpen = confirmed(s) < s.guards_required;
                              const mine = view === "officer" && r.key !== "open" ? s.assignments.find((a) => a.guard_id === r.key && a.status !== "cancelled") : undefined;
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  draggable
                                  onDragStart={(e) => onDragStart(e, s, mine?.guard_id)}
                                  onClick={() => setDrawer({ id: s.id })}
                                  className={`text-micro bg-paper hover:bg-surface-alt block w-full cursor-grab border border-l-4 px-2 py-1.5 text-left ${isOpen ? "border-magenta" : "border-hairline border-l-electric-blue"}`}
                                >
                                  <span className="text-ink block tabular-nums">
                                    {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
                                  </span>
                                  <span className="text-stone block truncate">{view === "site" ? `${confirmed(s)}/${s.guards_required} confirmed` : s.site_name}</span>
                                  <span className="text-stone block">
                                    {isOpen ? <span className="text-ink">Open</span> : null}
                                    {mine && mine.status === "offered" ? "Offered" : ""}
                                    {!s.published ? `${isOpen || mine?.status === "offered" ? " · " : ""}Draft` : ""}
                                  </span>
                                </button>
                              );
                            })}
                            {view === "site" && (
                              <button
                                type="button"
                                aria-label={`Add a shift at ${r.label} on ${fmtDay(d.toISOString())}`}
                                onClick={() => setDrawer({ create: { date, site_id: r.key } })}
                                className="text-micro text-stone hover:text-ink block w-full px-2 py-1 text-left opacity-60 hover:opacity-100"
                              >
                                + Add
                              </button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-micro text-stone">Drag a shift to another day to move it. In the officer view, drag it onto another officer to hand it over. Magenta edge = open shift.</p>
      </Page>

      {drawer && (
        <Drawer onClose={() => setDrawer(null)} title={selected ? `${selected.site_name}` : "New shift"}>
          {"create" in drawer ? (
            <ShiftForm
              sites={sites}
              initial={{ date: drawer.create.date, site_id: drawer.create.site_id }}
              onCancel={() => setDrawer(null)}
              onSaved={async () => {
                setDrawer(null);
                await load();
              }}
            />
          ) : selected ? (
            <ShiftDrawer
              s={selected}
              adminId={profile.id}
              sites={sites}
              officers={officers}
              requests={requests.filter((r) => r.shift_id === selected.id)}
              complianceFor={complianceFor}
              requirements={reqs[selected.site_id]?.requirements ?? null}
              onChanged={load}
              onDeleted={async () => {
                setDrawer(null);
                await load();
              }}
            />
          ) : (
            <Loading />
          )}
        </Drawer>
      )}
    </>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="on-dark bg-ink/40 absolute inset-0" onClick={onClose} aria-hidden="true" />
      <aside className="bg-paper absolute inset-y-0 right-0 flex w-full max-w-lg flex-col shadow-2xl">
        <div className="border-hairline flex items-center justify-between gap-4 border-b px-6 py-4">
          <h2 className="text-h4 text-ink truncate">{title}</h2>
          <button type="button" onClick={onClose} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </aside>
    </div>
  );
}

function ShiftForm({
  sites,
  initial,
  shift,
  onCancel,
  onSaved,
}: {
  sites: SiteRow[];
  initial?: { date: string; site_id?: string };
  shift?: ShiftRow;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const date = String(f.get("date"));
    const site_id = String(f.get("site") ?? "");
    if (!site_id) return setError("Choose a site.");
    const starts_at = localToIso(date, String(f.get("start")));
    let ends_at = localToIso(date, String(f.get("end")));
    if (Date.parse(ends_at) <= Date.parse(starts_at)) ends_at = new Date(Date.parse(ends_at) + DAY_MS).toISOString();
    const fields = {
      site_id,
      starts_at,
      ends_at,
      guards_required: Math.max(1, Number(f.get("required")) || 1),
      notes: String(f.get("notes") ?? "").trim() || null,
    };
    setBusy(true);
    setError(null);
    try {
      if (shift) await updateShift(shift.id, fields);
      else await createShift({ ...fields, open_for_requests: f.get("open") === "on", published: false });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <div className="sm:col-span-2">
        <SelectField label="Site" id="sf-site" name="site" defaultValue={shift?.site_id ?? initial?.site_id ?? ""}>
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
      <Field label="Date" id="sf-date" name="date" type="date" defaultValue={shift ? isoDate(new Date(shift.starts_at)) : initial?.date} required />
      <Field label="Officers needed" id="sf-req" name="required" type="number" min={1} max={50} defaultValue={shift?.guards_required ?? 1} />
      <Field label="Start" id="sf-start" name="start" type="time" defaultValue={shift ? fmtTime(shift.starts_at) : "07:00"} />
      <Field label="End" id="sf-end" name="end" type="time" defaultValue={shift ? fmtTime(shift.ends_at) : "19:00"} hint="Earlier than start = overnight." />
      <div className="sm:col-span-2">
        <TextArea label="Notes for officers (optional)" id="sf-notes" name="notes" rows={2} defaultValue={shift?.notes ?? ""} />
      </div>
      {!shift && (
        <label className="text-caption text-ink flex items-center gap-3 sm:col-span-2">
          <input type="checkbox" name="open" className="accent-electric-blue size-5" />
          Let officers request it (extra shift)
        </label>
      )}
      {!shift && <p className="text-micro text-stone sm:col-span-2">New shifts are drafts until you publish them.</p>}
      <div className="space-y-3 sm:col-span-2">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-3">
          <PortalButton type="submit" disabled={busy}>
            {busy ? "Saving" : shift ? "Save changes" : "Create draft shift"}
          </PortalButton>
          <PortalButton tone="quiet" onClick={onCancel}>
            Cancel
          </PortalButton>
        </div>
      </div>
    </form>
  );
}

const STATUS = {
  offered: { tone: "warn" as const, label: "Offered" },
  accepted: { tone: "good" as const, label: "Confirmed" },
  declined: { tone: "bad" as const, label: "Declined" },
  cancelled: { tone: "idle" as const, label: "Removed" },
};

function ShiftDrawer({
  s,
  adminId,
  sites,
  officers,
  requests,
  complianceFor,
  requirements,
  onChanged,
  onDeleted,
}: {
  s: ShiftRow;
  adminId: string;
  sites: SiteRow[];
  officers: Officer[];
  requests: RequestRow[];
  complianceFor: (guardId: string, siteId: string) => ComplianceResult;
  requirements: string | null;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const assigned = new Set(live(s).map((a) => a.guard_id));

  async function run(fn: () => Promise<void>, after?: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await (after ?? onChanged)();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
    setBusy(false);
  }

  if (editing) {
    return (
      <ShiftForm
        sites={sites}
        shift={s}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          await onChanged();
        }}
      />
    );
  }

  const candidates = officers
    .filter((o) => !assigned.has(o.id))
    .filter((o) => `${o.full_name} ${o.email ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    .map((o) => ({ o, c: complianceFor(o.id, s.site_id) }))
    .sort((a, b) => Number(a.c.status === "blocked") - Number(b.c.status === "blocked") || (a.o.full_name ?? "").localeCompare(b.o.full_name ?? ""));

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <div className="col-span-2">
          <dt className="text-caption text-stone">When</dt>
          <dd className="text-caption text-ink tabular-nums">
            {fmtDay(s.starts_at)}, {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-stone">Required</dt>
          <dd className="text-caption text-ink">
            {confirmed(s)} of {s.guards_required} confirmed
          </dd>
        </div>
        <div>
          <dt className="text-caption text-stone">State</dt>
          <dd>{s.published ? <Status tone="good">Published</Status> : <Status tone="idle">Draft</Status>}</dd>
        </div>
        {requirements && (
          <div className="col-span-2">
            <dt className="text-caption text-stone">Site requirements</dt>
            <dd className="text-caption text-ink whitespace-pre-line">{requirements}</dd>
          </div>
        )}
        {s.notes && (
          <div className="col-span-2">
            <dt className="text-caption text-stone">Notes</dt>
            <dd className="text-caption text-ink whitespace-pre-line">{s.notes}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-3">
        <PortalButton tone="quiet" className="min-h-11" onClick={() => setEditing(true)}>
          Edit details
        </PortalButton>
        {!s.published && (
          <PortalButton className="min-h-11" disabled={busy} onClick={() => run(() => publishShifts([s.id]))}>
            Publish
          </PortalButton>
        )}
        <PortalButton tone="quiet" className="min-h-11" disabled={busy} onClick={() => run(() => setShiftOpen(s.id, !s.open_for_requests))}>
          {s.open_for_requests ? "Stop extra-shift requests" : "Let officers request it"}
        </PortalButton>
      </div>

      <section>
        <h3 className="text-h4 text-ink">Officers</h3>
        {s.assignments.length === 0 ? (
          <p className="text-caption text-stone mt-2">Nobody yet.</p>
        ) : (
          <ul className="divide-hairline border-hairline mt-3 divide-y border">
            {s.assignments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="text-caption text-ink">{a.officer_name}</span>
                <span className="flex items-center gap-3">
                  <Status tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Status>
                  {(a.status === "offered" || a.status === "accepted") && (
                    <button type="button" disabled={busy} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink" onClick={() => run(() => setAssignmentStatus(a.id, "cancelled"))}>
                      Remove
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {requests.filter((r) => r.status === "pending").length > 0 && (
        <section>
          <h3 className="text-h4 text-ink">Requests to work it</h3>
          <ul className="divide-hairline border-hairline mt-3 divide-y border">
            {requests
              .filter((r) => r.status === "pending")
              .map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="text-caption text-ink">{r.officer_name}</span>
                  <span className="flex gap-3">
                    <PortalButton className="min-h-10 px-4" disabled={busy} onClick={() => run(() => decideRequest(r, adminId, true))}>
                      Approve
                    </PortalButton>
                    <PortalButton tone="quiet" className="min-h-10 px-4" disabled={busy} onClick={() => run(() => decideRequest(r, adminId, false))}>
                      Decline
                    </PortalButton>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-h4 text-ink">Offer to an officer</h3>
        <div className="mt-3">
          <Field label="Search officers" id="pick-q" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <ul className="divide-hairline border-hairline mt-3 max-h-80 divide-y overflow-y-auto border">
          {candidates.length === 0 && <li className="text-caption text-stone px-4 py-3">No other officers.</li>}
          {candidates.map(({ o, c }) => {
            const blocked = c.status === "blocked";
            return (
              <li key={o.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${blocked ? "opacity-60" : ""}`}>
                <span className="min-w-0">
                  <span className="text-caption text-ink block">{o.full_name || o.email}</span>
                  {c.status !== "valid" && <span className="text-micro text-stone block">{c.reasons.join(" · ")}</span>}
                </span>
                <PortalButton
                  tone="quiet"
                  className="min-h-10 shrink-0 px-4"
                  disabled={busy || blocked}
                  aria-disabled={blocked}
                  title={blocked ? c.reasons.join(", ") : undefined}
                  onClick={() => run(() => offerShift(s.id, o.id))}
                >
                  {blocked ? "Blocked" : "Offer"}
                </PortalButton>
              </li>
            );
          })}
        </ul>
        {!s.published && <p className="text-micro text-stone mt-2">Offers on a draft shift reach the officer when you publish it.</p>}
      </section>

      {error && <Notice kind="error">{error}</Notice>}

      <button
        type="button"
        disabled={busy}
        onClick={() => {
          if (confirm(`Delete the ${fmtTime(s.starts_at)} shift at ${s.site_name}?`)) run(() => deleteShift(s.id), onDeleted);
        }}
        className="text-caption text-ink underline decoration-magenta underline-offset-4 disabled:opacity-50"
      >
        Delete shift
      </button>
    </div>
  );
}
