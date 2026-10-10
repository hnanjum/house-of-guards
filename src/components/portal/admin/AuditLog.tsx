import { useCallback, useEffect, useState } from "react";
import { Field, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField } from "../ui";
import { addDays, isoDate, startOfToday, ukToInstant } from "./adminData";
import { Empty, Page, PageHeader, Panel } from "./kit";
import { downloadCsv, listAudit, listUsers, type AuditRow, type UserRow } from "./opsData";
import { AuditTable } from "./Guards";

/**
 * Audit log: read-only record of every change made through the portals
 * (who, what, when, old → new values) and every time a private document
 * was opened. Written by the database itself; nobody can edit or delete
 * an entry. Filter by person, action, record type and dates; export CSV.
 */

const ENTITIES = [
  "profiles",
  "shifts",
  "shift_assignments",
  "shift_requests",
  "sites",
  "site_instructions",
  "site_contacts",
  "checkpoints",
  "incidents",
  "alerts",
  "officer_documents",
  "officer_pay_rates",
  "payslips",
  "policies",
  "messages",
  "clients",
  "client_users",
  "client_settings",
  "client_requests",
  "daily_reports",
  "monthly_reports",
];

export default function AuditLog() {
  const [from, setFrom] = useState(isoDate(addDays(startOfToday(), -7)));
  const [to, setTo] = useState(isoDate(startOfToday()));
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listUsers()
      .then((u) => setUsers(u.filter((x) => x.role !== "client")))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(
        await listAudit({
          fromIso: ukToInstant(from).toISOString(),
          toIso: addDays(ukToInstant(to), 1).toISOString(),
          actor: actor || undefined,
          action: action || undefined,
          entity: entity || undefined,
          limit: 2000,
        }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the audit log.");
    }
  }, [from, to, actor, action, entity]);

  useEffect(() => {
    load();
  }, [load]);

  function exportCsv() {
    if (!rows) return;
    downloadCsv(`audit-log-${from}-to-${to}.csv`, [
      ["When (UK)", "Who", "Action", "Record type", "Record id", "Summary", "Changes"],
      ...rows.map((r) => [`${isoDate(new Date(r.at))} ${fmtTime(r.at)}`, r.actor_name ?? (r.actor_id ? "User" : "System"), r.action, r.entity, r.entity_id, r.summary, r.changes ? JSON.stringify(r.changes) : ""]),
    ]);
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={rows ? `${rows.length}${rows.length === 2000 ? "+" : ""} entr${rows.length === 1 ? "y" : "ies"}` : undefined}
        actions={
          <PortalButton tone="quiet" className="min-h-11 px-5" disabled={!rows?.length} onClick={exportCsv}>
            Export CSV
          </PortalButton>
        }
      />
      <Page>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="From" id="al-from" type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
          <Field label="To" id="al-to" type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
          <SelectField label="Person" id="al-actor" value={actor} onChange={(e) => setActor(e.target.value)}>
            <option value="">Anyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </SelectField>
          <SelectField label="Action" id="al-action" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Any</option>
            <option value="insert">Created</option>
            <option value="update">Changed</option>
            <option value="delete">Deleted</option>
            <option value="view">Viewed a document</option>
            <option value="reset_mfa">Reset 2-step</option>
          </SelectField>
          <SelectField label="Record type" id="al-entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Any</option>
            {ENTITIES.map((x) => (
              <option key={x} value={x}>
                {x.replace(/_/g, " ")}
              </option>
            ))}
          </SelectField>
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>{!rows ? <Loading /> : rows.length === 0 ? <Empty>Nothing recorded for these filters.</Empty> : <AuditTable rows={rows} />}</Panel>
        <p className="text-micro text-stone">Showing up to 2,000 entries, newest first ({fmtShortDay(ukToInstant(from).toISOString())} to {fmtShortDay(ukToInstant(to).toISOString())}). Narrow the dates for older records.</p>
      </Page>
    </>
  );
}
