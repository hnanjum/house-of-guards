import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import type { Profile } from "../../../lib/portalSupabase";
import { Field, fmtShortDay, fmtTime, Loading, Notice, PortalButton } from "../ui";
import { IconPlus, IconSearch } from "./icons";
import { addDays, listOfficers, setOfficerActive, startOfToday, updateOfficer, type Officer } from "./adminData";
import InviteForm from "./InviteForm";
import { Empty, Page, PageHeader, Panel, Status, Table, td } from "./kit";
import {
  addPayRate,
  compliance,
  daysUntil,
  kindLabel,
  listAuditForGuard,
  listDocuments,
  listGuardShifts,
  listPayRates,
  markRenewed,
  rejectDocument,
  sendReminder,
  verifyDocument,
  viewFile,
  type AuditRow,
  type Compliance,
  type DocumentRow,
  type GuardShift,
  type PayRate,
} from "./opsData";
import { Segmented, Tabs } from "../officers/widgets";

/**
 * Officers ("guards").
 * LIST — search, and filter by compliance: VALID, EXPIRING (something
 * expires within 60 days) or BLOCKED (no verified in-date SIA licence).
 * A coloured mark plus the word on every row.
 * PROFILE — tabs: Details, Compliance, Documents, Shifts, Pay rate,
 * History (the audit log for this officer).
 *
 * Documents are kept in a private storage bucket (encrypted at rest by
 * Supabase); every time someone in the office opens one, it is recorded
 * in the audit log, shown under History.
 */

const DOT: Record<Compliance, { tone: "good" | "warn" | "bad"; label: string }> = {
  valid: { tone: "good", label: "Valid" },
  expiring: { tone: "warn", label: "Expiring" },
  blocked: { tone: "bad", label: "Blocked" },
};
const link = "text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:opacity-50";

export default function Guards({ profile, selectedId, tab }: { profile: Profile; selectedId?: string; tab?: string }) {
  const [officers, setOfficers] = useState<Officer[] | null>(null);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Compliance>("all");

  const load = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([listOfficers(), listDocuments()]);
      setOfficers(o);
      setDocs(d);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load officers.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const comp = useMemo(() => {
    const m = new Map<string, ReturnType<typeof compliance>>();
    for (const o of officers ?? []) m.set(o.id, compliance(docs.filter((d) => d.guard_id === o.id)));
    return m;
  }, [officers, docs]);

  const selected = officers?.find((o) => o.id === selectedId);
  if (selectedId && selected) {
    return <GuardProfile o={selected} adminId={profile.id} docs={docs.filter((d) => d.guard_id === selected.id)} tab={tab ?? "details"} onChanged={load} />;
  }

  const q = query.trim().toLowerCase();
  const shown = (officers ?? []).filter(
    (o) => (!q || `${o.full_name} ${o.email ?? ""} ${o.phone ?? ""}`.toLowerCase().includes(q)) && (filter === "all" || comp.get(o.id)?.status === filter),
  );
  const count = (c: Compliance) => (officers ?? []).filter((o) => o.active && comp.get(o.id)?.status === c).length;

  return (
    <>
      <PageHeader
        title="Officers"
        subtitle={officers ? `${officers.filter((o) => o.active).length} active · ${count("blocked")} blocked · ${count("expiring")} expiring` : undefined}
        actions={
          <PortalButton onClick={() => setInviting(true)} className="min-h-11 gap-2 px-5">
            <IconPlus width={16} height={16} />
            Invite officer
          </PortalButton>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {inviting && <InviteForm role="guard" onClose={() => setInviting(false)} onDone={load} />}
        <div className="flex flex-wrap items-center gap-4">
          <label className="border-hairline bg-paper flex min-h-11 w-full max-w-sm items-center gap-2 border px-3">
            <IconSearch width={16} height={16} className="text-stone shrink-0" />
            <span className="sr-only">Search officers</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, phone" className="text-caption text-ink w-full bg-transparent focus:outline-none" />
          </label>
          <Segmented
            label="Compliance"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "valid", label: "Valid" },
              { value: "expiring", label: "Expiring" },
              { value: "blocked", label: "Blocked" },
            ]}
          />
        </div>
        <Panel flush>
          {!officers ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty>{officers.length ? "No officers match." : "No officers yet. Invite your first officer to get started."}</Empty>
          ) : (
            <Table head={["Name", "Compliance", "Email", "Phone", "Account"]}>
              {shown.map((o) => {
                const c = comp.get(o.id)!;
                return (
                  <tr key={o.id} className="hover:bg-surface-alt">
                    <td className={td}>
                      <a href={`#/officers/${o.id}`} className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                        {o.full_name || "No name set"}
                      </a>
                    </td>
                    <td className={td}>
                      <Status tone={DOT[c.status].tone} wrap>
                        {DOT[c.status].label}
                        {c.reasons[0] ? ` · ${c.reasons[0]}` : ""}
                      </Status>
                    </td>
                    <td className={td}>{o.email ?? "—"}</td>
                    <td className={`${td} tabular-nums`}>{o.phone ?? "—"}</td>
                    <td className={td}>
                      <Status tone={o.active ? "good" : "idle"}>{o.active ? "Active" : "Deactivated"}</Status>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
      </Page>
    </>
  );
}

function GuardProfile({ o, adminId, docs, tab, onChanged }: { o: Officer; adminId: string; docs: DocumentRow[]; tab: string; onChanged: () => Promise<void> }) {
  const c = compliance(docs);
  const base = `#/officers/${o.id}`;
  return (
    <>
      <PageHeader
        title={o.full_name || o.email || "Officer"}
        subtitle={o.active ? "Active" : "Deactivated"}
        actions={
          <>
            <Status tone={DOT[c.status].tone}>{DOT[c.status].label}</Status>
            <a href="#/officers" className={link}>
              All officers
            </a>
          </>
        }
      />
      <Page>
        <Tabs
          active={tab}
          items={[
            { key: "details", href: base, label: "Details" },
            { key: "compliance", href: `${base}/compliance`, label: "Compliance" },
            { key: "documents", href: `${base}/documents`, label: "Documents" },
            { key: "shifts", href: `${base}/shifts`, label: "Shifts" },
            { key: "pay", href: `${base}/pay`, label: "Pay rate" },
            { key: "history", href: `${base}/history`, label: "History" },
          ]}
        />
        {tab === "compliance" ? (
          <ComplianceTab o={o} adminId={adminId} docs={docs} onChanged={onChanged} />
        ) : tab === "documents" ? (
          <DocumentsTab o={o} docs={docs} />
        ) : tab === "shifts" ? (
          <ShiftsTab o={o} />
        ) : tab === "pay" ? (
          <PayTab o={o} />
        ) : tab === "history" ? (
          <HistoryTab o={o} />
        ) : (
          <DetailsTab o={o} onChanged={onChanged} />
        )}
      </Page>
    </>
  );
}

function DetailsTab({ o, onChanged }: { o: Officer; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function save(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const full_name = String(f.get("name") ?? "").trim();
    if (!full_name) return setMsg({ kind: "error", text: "Enter a name." });
    setBusy(true);
    try {
      await updateOfficer(o.id, { full_name, phone: String(f.get("phone") ?? "").trim() || null });
      await onChanged();
      setMsg({ kind: "info", text: "Saved." });
    } catch {
      setMsg({ kind: "error", text: "Couldn't save." });
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <Panel title="Details">
        <form onSubmit={save} className="space-y-4">
          <Field label="Full name" id="g-name" name="name" defaultValue={o.full_name} />
          <Field label="Mobile" id="g-phone" name="phone" type="tel" defaultValue={o.phone ?? ""} />
          <p className="text-caption text-stone">Email: {o.email ?? "—"} (set by the account; can't be changed here)</p>
          <p className="text-caption text-stone">Joined {fmtShortDay(o.created_at)}</p>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <PortalButton type="submit" disabled={busy}>
            Save
          </PortalButton>
        </form>
      </Panel>
      <Panel title="Account">
        <p className="text-caption text-ink">{o.active ? "This officer can sign in." : "This account is deactivated and can't sign in."}</p>
        <PortalButton
          tone="quiet"
          className="mt-4"
          disabled={busy}
          onClick={async () => {
            if (!confirm(`${o.active ? "Deactivate" : "Reactivate"} ${o.full_name || o.email}?`)) return;
            setBusy(true);
            await setOfficerActive(o.id, !o.active).catch(() => {});
            await onChanged();
            setBusy(false);
          }}
        >
          {o.active ? "Deactivate" : "Reactivate"}
        </PortalButton>
      </Panel>
    </div>
  );
}

const REQUIRED_KINDS = ["sia_licence", "right_to_work", "dbs", "vetting", "first_aid", "training"];

function ComplianceTab({ o, adminId, docs, onChanged }: { o: Officer; adminId: string; docs: DocumentRow[]; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const c = compliance(docs);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await onChanged();
      setMsg(ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That didn't work.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <Panel>
        <Status tone={DOT[c.status].tone} wrap>
          {DOT[c.status].label}
          {c.reasons.length ? `: ${c.reasons.join(" · ")}` : " — nothing outstanding"}
        </Status>
      </Panel>
      {msg && <Notice>{msg}</Notice>}
      <Panel flush>
        <Table head={["Requirement", "Latest document", "Expiry", "Status", ""]}>
          {REQUIRED_KINDS.map((kind) => {
            const list = docs.filter((d) => d.kind === kind).sort((a, b) => (b.expires_on ?? b.uploaded_at).localeCompare(a.expires_on ?? a.uploaded_at));
            const d = list[0];
            const left = d ? daysUntil(d.expires_on) : null;
            return (
              <tr key={kind}>
                <td className={td}>{kindLabel(kind)}</td>
                <td className={td}>
                  {d ? (
                    <>
                      {d.title}
                      {d.reference ? <span className="text-micro text-stone block">{d.reference}</span> : null}
                    </>
                  ) : (
                    <span className="text-stone">None uploaded</span>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {!d?.expires_on ? "—" : left! < 0 ? <Status tone="bad">Expired</Status> : left! <= 60 ? <Status tone="warn">{left} days</Status> : fmtShortDay(d.expires_on + "T12:00:00Z")}
                </td>
                <td className={td}>
                  {!d ? (
                    <Status tone={kind === "sia_licence" ? "bad" : "idle"}>Missing</Status>
                  ) : d.rejected_reason ? (
                    <Status tone="bad">Rejected</Status>
                  ) : d.verified_at ? (
                    <Status tone="good">Verified</Status>
                  ) : (
                    <Status tone="warn">Awaiting check</Status>
                  )}
                </td>
                <td className={`${td} text-right whitespace-nowrap`}>
                  {d && !d.verified_at && (
                    <button type="button" disabled={busy} className={`${link} mr-4`} onClick={() => run(() => verifyDocument(d.id, adminId), "Verified.")}>
                      Verify
                    </button>
                  )}
                  {d && !d.verified_at && (
                    <button
                      type="button"
                      disabled={busy}
                      className={`${link} mr-4`}
                      onClick={() => {
                        const reason = prompt("Why can't it be accepted? The officer will see this.");
                        if (reason?.trim()) run(() => rejectDocument(d.id, reason.trim()), "Rejected.");
                      }}
                    >
                      Reject
                    </button>
                  )}
                  {d && (
                    <button
                      type="button"
                      disabled={busy}
                      className={`${link} mr-4`}
                      onClick={() => {
                        const date = prompt("New expiry date (YYYY-MM-DD)");
                        if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) run(() => markRenewed(d.id, adminId, date), "Marked renewed.");
                      }}
                    >
                      Mark renewed
                    </button>
                  )}
                  {d && left != null && left <= 60 && (
                    <button type="button" disabled={busy} className={link} onClick={() => run(() => sendReminder(adminId, o.id, d), `Reminder sent to ${o.full_name}.`)}>
                      Send reminder
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>
    </div>
  );
}

function DocumentsTab({ o, docs }: { o: Officer; docs: DocumentRow[] }) {
  return (
    <Panel flush>
      {docs.length === 0 ? (
        <Empty>No documents uploaded.</Empty>
      ) : (
        <Table head={["Document", "Uploaded", "Expires", ""]}>
          {docs.map((d) => (
            <tr key={d.id}>
              <td className={td}>
                {d.title}
                <span className="text-micro text-stone block">
                  {kindLabel(d.kind)}
                  {d.reference ? ` · ${d.reference}` : ""}
                </span>
              </td>
              <td className={`${td} whitespace-nowrap`}>{fmtShortDay(d.uploaded_at)}</td>
              <td className={`${td} whitespace-nowrap`}>{d.expires_on ? fmtShortDay(d.expires_on + "T12:00:00Z") : "—"}</td>
              <td className={`${td} text-right`}>
                {d.file_path ? (
                  <button
                    type="button"
                    className={link}
                    onClick={async () => {
                      const url = await viewFile("officer-documents", d.file_path!, "officer_documents", d.id, `${o.full_name}: ${d.title}`);
                      if (url) window.open(url, "_blank", "noopener");
                    }}
                  >
                    Open (logged)
                  </button>
                ) : (
                  <span className="text-stone">No file</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
      <p className="text-micro text-stone px-6 pb-5 pt-3">Files are stored privately and encrypted at rest. Each opening is recorded under History.</p>
    </Panel>
  );
}

function ShiftsTab({ o }: { o: Officer }) {
  const [list, setList] = useState<GuardShift[] | null>(null);
  useEffect(() => {
    const today = startOfToday();
    listGuardShifts(o.id, addDays(today, -60).toISOString(), addDays(today, 30).toISOString())
      .then(setList)
      .catch(() => setList([]));
  }, [o.id]);
  const label: Record<string, { tone: "good" | "warn" | "bad" | "idle"; t: string }> = {
    accepted: { tone: "good", t: "Confirmed" },
    offered: { tone: "warn", t: "Offered" },
    declined: { tone: "bad", t: "Declined" },
    cancelled: { tone: "idle", t: "Removed" },
  };
  return (
    <Panel flush title="Last 60 days and next 30">
      {!list ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty>No shifts.</Empty>
      ) : (
        <Table head={["Shift", "Site", "Status", "Approved"]}>
          {list.map((s) => (
            <tr key={s.assignment_id}>
              <td className={`${td} whitespace-nowrap tabular-nums`}>
                {fmtShortDay(s.starts_at)} · {fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}
              </td>
              <td className={td}>{s.site_name}</td>
              <td className={td}>
                <Status tone={label[s.status]?.tone ?? "idle"}>{label[s.status]?.t ?? s.status}</Status>
              </td>
              <td className={`${td} tabular-nums`}>{s.approved_minutes != null ? `${(s.approved_minutes / 60).toFixed(2)} h` : "—"}</td>
            </tr>
          ))}
        </Table>
      )}
    </Panel>
  );
}

function PayTab({ o }: { o: Officer }) {
  const [rates, setRates] = useState<PayRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => setRates(await listPayRates(o.id).catch(() => [])), [o.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function add(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const rate = Number(f.get("rate"));
    const from = String(f.get("from") ?? "");
    if (!(rate >= 0) || !from) return setError("Enter the hourly rate and the date it starts.");
    try {
      await addPayRate({ guard_id: o.id, hourly_rate: Math.round(rate * 100) / 100, effective_from: from, notes: String(f.get("notes") ?? "").trim() || null });
      form.reset();
      setError(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <Panel title="Pay rates" flush>
        {!rates ? (
          <Loading />
        ) : rates.length === 0 ? (
          <Empty>No rate set.</Empty>
        ) : (
          <Table head={["From", "Hourly rate", "Notes"]}>
            {rates.map((r, i) => (
              <tr key={r.id}>
                <td className={`${td} whitespace-nowrap`}>
                  {fmtShortDay(r.effective_from + "T12:00:00Z")}
                  {i === 0 ? <span className="text-micro text-stone block">Current</span> : null}
                </td>
                <td className={`${td} tabular-nums`}>£{r.hourly_rate.toFixed(2)}</td>
                <td className={td}>{r.notes ?? "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
      <Panel title="New rate">
        <form onSubmit={add} className="space-y-4" noValidate>
          <Field label="Hourly rate (£)" id="pr-rate" name="rate" type="number" step="0.01" min={0} />
          <Field label="Starts on" id="pr-from" name="from" type="date" />
          <Field label="Notes (optional)" id="pr-notes" name="notes" placeholder="e.g. Night rate, NLW rise" />
          {error && <Notice kind="error">{error}</Notice>}
          <PortalButton type="submit">Add rate</PortalButton>
          <p className="text-micro text-stone">Used in the timesheet CSV export. Officers can't see pay rates here.</p>
        </form>
      </Panel>
    </div>
  );
}

function HistoryTab({ o }: { o: Officer }) {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    listAuditForGuard(o.id)
      .then(setRows)
      .catch(() => setRows([]));
  }, [o.id]);
  return (
    <Panel flush title="History">
      {!rows ? <Loading /> : rows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : <AuditTable rows={rows} />}
    </Panel>
  );
}

export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return (
    <Table head={["When", "Who", "Action", "Record", "Changes"]}>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className={`${td} whitespace-nowrap tabular-nums`}>
            {fmtShortDay(r.at)} {fmtTime(r.at)}
          </td>
          <td className={td}>{r.actor_name ?? (r.actor_id ? "User" : "System")}</td>
          <td className={td}>{r.action}</td>
          <td className={td}>
            {r.entity.replace(/_/g, " ")}
            {r.summary ? <span className="text-micro text-stone block break-words">{r.summary}</span> : null}
          </td>
          <td className={`${td} text-micro max-w-md break-words`}>{summariseChanges(r)}</td>
        </tr>
      ))}
    </Table>
  );
}

function summariseChanges(r: AuditRow): string {
  if (!r.changes || r.action !== "update") return "";
  return Object.entries(r.changes as Record<string, { from: unknown; to: unknown }>)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${fmtVal(v?.from)} → ${fmtVal(v?.to)}`)
    .join("; ");
}

const fmtVal = (v: unknown) => (v == null ? "—" : typeof v === "string" ? (v.length > 60 ? v.slice(0, 60) + "…" : v) : JSON.stringify(v));

