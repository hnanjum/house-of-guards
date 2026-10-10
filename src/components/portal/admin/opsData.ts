import { supabase } from "../../../lib/portalSupabase";

/**
 * Admin (control) data for officer operations: alerts, incidents, the
 * occurrence book, patrols, checklists, messages, documents, policies,
 * timesheet approval, extra-shift requests, payslips, and per-site
 * checkpoints/keys/checklists. Access is decided by RLS (admin only).
 */

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
const nameOf = (p: Row) => p?.full_name || p?.email || "Officer";

/* ---------- alerts ---------- */

export interface AlertRow {
  id: string;
  kind: "panic" | "welfare_missed" | "patrol_overdue" | "missed_checkpoints" | "incident";
  created_at: string;
  device_time: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  details: string | null;
  offline: boolean;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  escalated_at: string | null;
  escalation_note: string | null;
  site_id: string | null;
  guard_id: string;
  officer_name: string;
  officer_phone: string | null;
  site_name: string | null;
}

export const ALERT_LABEL: Record<AlertRow["kind"], string> = {
  panic: "PANIC",
  welfare_missed: "Missed welfare check-in",
  patrol_overdue: "Patrol overdue",
  missed_checkpoints: "Checkpoints missed",
  incident: "Serious incident reported",
};

const ALERT_FIELDS = "id, kind, created_at, device_time, latitude, longitude, accuracy_m, details, offline, acknowledged_at, resolved_at, resolution, escalated_at, escalation_note, site_id, guard_id, profiles!alerts_guard_id_fkey(full_name, email, phone), sites(name)";

const toAlert = (r: Row): AlertRow => ({
  ...r,
  officer_name: nameOf(r.profiles),
  officer_phone: r.profiles?.phone ?? null,
  site_name: r.sites?.name ?? null,
  profiles: undefined,
  sites: undefined,
});

export async function listAlerts(opts: { open?: boolean; sinceIso?: string } = {}): Promise<AlertRow[]> {
  let q = supabase.from("alerts").select(ALERT_FIELDS).order("created_at", { ascending: false }).limit(200);
  if (opts.open) q = q.is("resolved_at", null);
  if (opts.sinceIso) q = q.gte("created_at", opts.sinceIso);
  return (check(await q) ?? []).map(toAlert);
}

export async function acknowledgeAlert(id: string, adminId: string) {
  check(await supabase.from("alerts").update({ acknowledged_at: new Date().toISOString(), acknowledged_by: adminId }).eq("id", id).is("acknowledged_at", null).select("id"));
}

export async function resolveAlert(id: string, adminId: string, resolution: string) {
  const now = new Date().toISOString();
  check(
    await supabase
      .from("alerts")
      .update({ resolved_at: now, resolved_by: adminId, resolution: resolution || null })
      .eq("id", id)
      .select("id"),
  );
  // An alert resolved without acknowledging first counts as seen.
  await supabase.from("alerts").update({ acknowledged_at: now, acknowledged_by: adminId }).eq("id", id).is("acknowledged_at", null);
}

/** Live feed: calls back on any new or changed alert, incident or client request. */
export function subscribeControl(onChange: (table: "alerts" | "incidents" | "client_requests", row: Row, event: string) => void) {
  const channel = supabase
    .channel("control-room")
    .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, (p) => onChange("alerts", p.new, p.eventType))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "incidents" }, (p) => onChange("incidents", p.new, p.eventType))
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_requests" }, (p) => onChange("client_requests", p.new, p.eventType))
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

/* ---------- on duty now ---------- */

export interface OnDutyRow {
  assignment_id: string;
  officer_name: string;
  officer_phone: string | null;
  site_name: string;
  clocked_in: string;
  welfare_interval_min: number | null;
  patrol_interval_min: number | null;
  last_welfare: string | null;
  last_patrol: string | null;
}

export async function listOnDuty(): Promise<OnDutyRow[]> {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const events = check(
    await supabase
      .from("clock_events")
      .select("assignment_id, type, server_time, profiles(full_name, email, phone), shift_assignments(shifts(sites(name, welfare_interval_min, patrol_interval_min)))")
      .gte("server_time", since)
      .order("server_time", { ascending: true })
      .limit(2000),
  ) as Row[];
  const last = new Map<string, Row>();
  const firstIn = new Map<string, string>();
  for (const e of events) {
    last.set(e.assignment_id, e);
    if (e.type === "in" && !firstIn.has(e.assignment_id)) firstIn.set(e.assignment_id, e.server_time);
  }
  const on = [...last.values()].filter((e) => e.type === "in");
  if (!on.length) return [];
  const ids = on.map((e) => e.assignment_id);
  const [welfare, patrols] = await Promise.all([
    check(await supabase.from("welfare_checks").select("assignment_id, checked_at").in("assignment_id", ids).order("checked_at", { ascending: false })) as Row[],
    check(await supabase.from("patrols").select("assignment_id, started_at").in("assignment_id", ids).order("started_at", { ascending: false })) as Row[],
  ]);
  return on.map((e) => {
    const site = e.shift_assignments?.shifts?.sites ?? {};
    return {
      assignment_id: e.assignment_id,
      officer_name: nameOf(e.profiles),
      officer_phone: e.profiles?.phone ?? null,
      site_name: site.name ?? "—",
      clocked_in: firstIn.get(e.assignment_id) ?? e.server_time,
      welfare_interval_min: site.welfare_interval_min ?? null,
      patrol_interval_min: site.patrol_interval_min ?? null,
      last_welfare: welfare.find((w) => w.assignment_id === e.assignment_id)?.checked_at ?? null,
      last_patrol: patrols.find((p) => p.assignment_id === e.assignment_id)?.started_at ?? null,
    };
  });
}

/* ---------- incidents ---------- */

export interface IncidentRow {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: "open" | "reviewing" | "closed";
  description: string;
  occurred_at: string;
  server_time: string;
  device_time: string;
  latitude: number | null;
  longitude: number | null;
  police_ref: string | null;
  people: string | null;
  offline: boolean;
  admin_notes: string | null;
  reviewed_at: string | null;
  assigned_to: string | null;
  shared_with_client: boolean;
  shared_at: string | null;
  client_summary: string | null;
  officer_name: string;
  site_name: string;
  site_id: string;
  media: { id: string; path: string; mime: string; size_bytes: number | null }[];
}

export async function listIncidents(sinceIso: string): Promise<IncidentRow[]> {
  const rows = check(
    await supabase
      .from("incidents")
      .select("*, profiles!incidents_guard_id_fkey(full_name, email), sites(name), incident_media(id, path, mime, size_bytes)")
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: false })
      .limit(500),
  ) as Row[];
  return rows.map((r) => ({ ...r, officer_name: nameOf(r.profiles), site_name: r.sites?.name ?? "—", media: r.incident_media ?? [] }));
}

export async function reviewIncident(id: string, adminId: string, status: IncidentRow["status"], notes: string) {
  check(await supabase.from("incidents").update({ status, admin_notes: notes || null, reviewed_by: adminId, reviewed_at: new Date().toISOString() }).eq("id", id).select("id"));
}

export async function signed(bucket: string, path: string, seconds = 600) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

/* ---------- occurrence book / site day ---------- */

export interface BookEntry {
  id: string;
  kind: string;
  subject: string | null;
  body: string;
  details: Record<string, string>;
  occurred_at: string;
  author_name: string | null;
  offline: boolean;
}

export async function listLog(siteId: string, fromIso: string, toIso: string): Promise<BookEntry[]> {
  return check(
    await supabase
      .from("log_entries")
      .select("id, kind, subject, body, details, occurred_at, author_name, offline")
      .eq("site_id", siteId)
      .gte("occurred_at", fromIso)
      .lt("occurred_at", toIso)
      .order("occurred_at", { ascending: true })
      .limit(2000),
  );
}

export interface PatrolReport {
  id: string;
  started_at: string;
  ended_at: string | null;
  checkpoints_total: number | null;
  checkpoints_missed: number | null;
  officer_name: string;
  client_note: string | null;
  client_shared: boolean;
  scans: { checkpoint: string; scanned_at: string; in_order: boolean }[];
}

export async function listPatrols(siteId: string, fromIso: string, toIso: string): Promise<PatrolReport[]> {
  const rows = check(
    await supabase
      .from("patrols")
      .select("id, started_at, ended_at, checkpoints_total, checkpoints_missed, client_note, client_shared, profiles(full_name, email), checkpoint_scans(scanned_at, in_order, checkpoints(name))")
      .eq("site_id", siteId)
      .gte("started_at", fromIso)
      .lt("started_at", toIso)
      .order("started_at")
      .limit(500),
  ) as Row[];
  return rows.map((r) => ({
    id: r.id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    checkpoints_total: r.checkpoints_total,
    checkpoints_missed: r.checkpoints_missed,
    officer_name: nameOf(r.profiles),
    client_note: r.client_note ?? null,
    client_shared: r.client_shared ?? false,
    scans: (r.checkpoint_scans ?? [])
      .map((s: Row) => ({ checkpoint: s.checkpoints?.name ?? "?", scanned_at: s.scanned_at, in_order: s.in_order }))
      .sort((a: { scanned_at: string }, b: { scanned_at: string }) => a.scanned_at.localeCompare(b.scanned_at)),
  }));
}

export interface SubmissionRow {
  id: string;
  checklist_name: string;
  completed_at: string;
  issues: number;
  notes: string | null;
  results: { item: string; ok: boolean; note?: string }[];
  officer_name: string;
}

export async function listSubmissions(siteId: string, fromIso: string, toIso: string): Promise<SubmissionRow[]> {
  const rows = check(
    await supabase
      .from("checklist_submissions")
      .select("id, checklist_name, completed_at, issues, notes, results, profiles(full_name, email)")
      .eq("site_id", siteId)
      .gte("completed_at", fromIso)
      .lt("completed_at", toIso)
      .order("completed_at")
      .limit(500),
  ) as Row[];
  return rows.map((r) => ({ ...r, officer_name: nameOf(r.profiles) }));
}

/* ---------- site setup: checkpoints, keys, checklists ---------- */

export interface CheckpointRow {
  id: string;
  site_id: string;
  name: string;
  code: string;
  sort_order: number;
  active: boolean;
}

export async function listCheckpointsAdmin(siteId: string): Promise<CheckpointRow[]> {
  return check(await supabase.from("checkpoints").select("id, site_id, name, code, sort_order, active").eq("site_id", siteId).order("sort_order").order("name"));
}

export async function saveCheckpoint(c: { id?: string; site_id: string; name: string; sort_order: number; active?: boolean }) {
  const { id, ...fields } = c;
  if (id) check(await supabase.from("checkpoints").update(fields).eq("id", id).select("id"));
  else check(await supabase.from("checkpoints").insert(fields).select("id"));
}

/** A new random code (the old sticker stops working). */
export async function regenerateCheckpointCode(id: string) {
  const code = crypto.randomUUID().replace(/-/g, "");
  check(await supabase.from("checkpoints").update({ code }).eq("id", id).select("id"));
}

export interface KeyRow {
  id: string;
  site_id: string;
  label: string;
  notes: string | null;
  active: boolean;
}

export async function listKeysAdmin(siteId: string): Promise<KeyRow[]> {
  return check(await supabase.from("site_keys").select("id, site_id, label, notes, active").eq("site_id", siteId).order("label"));
}

export async function saveKey(k: { id?: string; site_id: string; label: string; notes: string | null; active?: boolean }) {
  const { id, ...fields } = k;
  if (id) check(await supabase.from("site_keys").update(fields).eq("id", id).select("id"));
  else check(await supabase.from("site_keys").insert(fields).select("id"));
}

export interface ChecklistRow {
  id: string;
  site_id: string | null;
  kind: "equipment" | "site";
  name: string;
  items: string[];
  prompt_at: "clock_in" | "clock_out" | "any";
  active: boolean;
  sort_order: number;
}

export async function listChecklistsAdmin(siteId: string | null): Promise<ChecklistRow[]> {
  let q = supabase.from("checklists").select("id, site_id, kind, name, items, prompt_at, active, sort_order").order("sort_order").order("name");
  q = siteId ? q.eq("site_id", siteId) : q.is("site_id", null);
  return check(await q);
}

export async function saveChecklist(c: Omit<ChecklistRow, "id"> & { id?: string }) {
  const { id, ...fields } = c;
  if (id) check(await supabase.from("checklists").update(fields).eq("id", id).select("id"));
  else check(await supabase.from("checklists").insert(fields).select("id"));
}

export async function uploadSiteFile(siteId: string, file: File): Promise<{ path: string; name: string }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const path = `${siteId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("site-files").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return { path, name: file.name };
}

/* ---------- messages ---------- */

export interface MessageRow {
  id: string;
  audience: "all" | "site" | "officer";
  site_name: string | null;
  recipient_name: string | null;
  subject: string;
  body: string;
  requires_ack: boolean;
  created_at: string;
  receipts: { guard_id: string; officer_name: string; read_at: string; acknowledged_at: string | null }[];
}

export async function listMessages(): Promise<MessageRow[]> {
  const rows = check(
    await supabase
      .from("messages")
      .select(
        "id, audience, subject, body, requires_ack, created_at, sites(name), recipient:profiles!messages_recipient_id_fkey(full_name, email), message_receipts(guard_id, read_at, acknowledged_at, profiles(full_name, email))",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ) as Row[];
  return rows.map((r) => ({
    id: r.id,
    audience: r.audience,
    site_name: r.sites?.name ?? null,
    recipient_name: r.recipient ? nameOf(r.recipient) : null,
    subject: r.subject,
    body: r.body,
    requires_ack: r.requires_ack,
    created_at: r.created_at,
    receipts: (r.message_receipts ?? []).map((x: Row) => ({ guard_id: x.guard_id, officer_name: nameOf(x.profiles), read_at: x.read_at, acknowledged_at: x.acknowledged_at })),
  }));
}

export async function sendMessage(m: { sender_id: string; audience: "all" | "site" | "officer"; site_id: string | null; recipient_id: string | null; subject: string; body: string; requires_ack: boolean }) {
  check(await supabase.from("messages").insert(m).select("id"));
}

/* ---------- documents ---------- */

export interface DocumentRow {
  id: string;
  guard_id: string;
  officer_name: string;
  kind: string;
  title: string;
  reference: string | null;
  issued_on: string | null;
  expires_on: string | null;
  file_path: string | null;
  uploaded_at: string;
  verified_at: string | null;
  rejected_reason: string | null;
}

export async function listDocuments(): Promise<DocumentRow[]> {
  const rows = check(
    await supabase
      .from("officer_documents")
      .select("id, guard_id, kind, title, reference, issued_on, expires_on, file_path, uploaded_at, verified_at, rejected_reason, profiles!officer_documents_guard_id_fkey(full_name, email)")
      .order("uploaded_at", { ascending: false })
      .limit(2000),
  ) as Row[];
  return rows.map((r) => ({ ...r, officer_name: nameOf(r.profiles), profiles: undefined }));
}

export async function verifyDocument(id: string, adminId: string) {
  check(await supabase.from("officer_documents").update({ verified_at: new Date().toISOString(), verified_by: adminId, rejected_reason: null }).eq("id", id).select("id"));
}

export async function rejectDocument(id: string, reason: string) {
  check(await supabase.from("officer_documents").update({ verified_at: null, verified_by: null, rejected_reason: reason }).eq("id", id).select("id"));
}

/* ---------- policies ---------- */

export interface PolicyRow {
  id: string;
  kind: "policy" | "training";
  title: string;
  summary: string | null;
  body: string;
  link_url: string | null;
  version: number;
  requires_ack: boolean;
  active: boolean;
  sort_order: number;
  updated_at: string;
  acks: { guard_id: string; version: number; acked_at: string }[];
}

export async function listPoliciesAdmin(): Promise<PolicyRow[]> {
  const rows = check(
    await supabase
      .from("policies")
      .select("id, kind, title, summary, body, link_url, version, requires_ack, active, sort_order, updated_at, policy_acks(guard_id, version, acked_at)")
      .order("sort_order")
      .order("title"),
  ) as Row[];
  return rows.map((r) => ({ ...r, acks: r.policy_acks ?? [], policy_acks: undefined }));
}

export async function savePolicy(p: Omit<PolicyRow, "id" | "acks" | "updated_at"> & { id?: string }) {
  const { id, ...fields } = p;
  if (id) check(await supabase.from("policies").update(fields).eq("id", id).select("id"));
  else check(await supabase.from("policies").insert(fields).select("id"));
}

/* ---------- timesheets ---------- */

export interface TimesheetRow {
  assignment_id: string;
  guard_id: string;
  officer_name: string;
  site_name: string;
  starts_at: string;
  ends_at: string;
  first_in: string | null;
  last_out: string | null;
  in_offset: number | null;
  out_offset: number | null;
  /** Any clock in/out made away from the site (or with no location). */
  off_site: boolean;
  approved_minutes: number | null;
  approved_at: string | null;
  approval_note: string | null;
}

export async function listTimesheets(fromIso: string, toIso: string): Promise<TimesheetRow[]> {
  const rows = check(
    await supabase
      .from("shift_assignments")
      .select(
        "id, guard_id, approved_minutes, approved_at, approval_note, profiles!shift_assignments_guard_id_fkey(full_name, email), shifts!inner(starts_at, ends_at, sites(name)), clock_events(type, server_time, schedule_offset_min, within_geofence)",
      )
      .eq("status", "accepted")
      .gte("shifts.starts_at", fromIso)
      .lt("shifts.starts_at", toIso)
      .limit(2000),
  ) as Row[];
  return rows
    .map((r) => {
      const ev = [...(r.clock_events ?? [])].sort((a: Row, b: Row) => a.server_time.localeCompare(b.server_time));
      const ins = ev.filter((e: Row) => e.type === "in");
      const outs = ev.filter((e: Row) => e.type === "out");
      return {
        assignment_id: r.id,
        guard_id: r.guard_id,
        officer_name: nameOf(r.profiles),
        site_name: r.shifts?.sites?.name ?? "—",
        starts_at: r.shifts.starts_at,
        ends_at: r.shifts.ends_at,
        first_in: ins[0]?.server_time ?? null,
        last_out: outs.at(-1)?.server_time ?? null,
        in_offset: ins[0]?.schedule_offset_min ?? null,
        out_offset: outs.at(-1)?.schedule_offset_min ?? null,
        off_site: ev.some((e: Row) => e.within_geofence !== true),
        approved_minutes: r.approved_minutes,
        approved_at: r.approved_at,
        approval_note: r.approval_note,
      };
    })
    .sort((a, b) => a.officer_name.localeCompare(b.officer_name) || a.starts_at.localeCompare(b.starts_at));
}

export async function approveHours(assignmentId: string, adminId: string, minutes: number | null, note: string | null) {
  check(
    await supabase
      .from("shift_assignments")
      .update(
        minutes == null
          ? { approved_minutes: null, approved_at: null, approved_by: null, approval_note: null }
          : { approved_minutes: minutes, approved_at: new Date().toISOString(), approved_by: adminId, approval_note: note },
      )
      .eq("id", assignmentId)
      .select("id"),
  );
}

/* ---------- extra shift requests ---------- */

export interface RequestRow {
  id: string;
  shift_id: string;
  guard_id: string;
  officer_name: string;
  note: string | null;
  status: string;
  created_at: string;
}

export async function listRequests(shiftIds: string[]): Promise<RequestRow[]> {
  if (!shiftIds.length) return [];
  const rows = check(
    await supabase
      .from("shift_requests")
      .select("id, shift_id, guard_id, note, status, created_at, profiles!shift_requests_guard_id_fkey(full_name, email)")
      .in("shift_id", shiftIds)
      .order("created_at"),
  ) as Row[];
  return rows.map((r) => ({ ...r, officer_name: nameOf(r.profiles) }));
}

export async function decideRequest(r: RequestRow, adminId: string, approve: boolean) {
  if (approve) {
    check(
      await supabase
        .from("shift_assignments")
        .upsert({ shift_id: r.shift_id, guard_id: r.guard_id, status: "accepted" }, { onConflict: "shift_id,guard_id" })
        .select("id"),
    );
  }
  check(
    await supabase
      .from("shift_requests")
      .update({ status: approve ? "approved" : "declined", decided_at: new Date().toISOString(), decided_by: adminId })
      .eq("id", r.id)
      .select("id"),
  );
}

export async function setShiftOpen(shiftId: string, open: boolean) {
  check(await supabase.from("shifts").update({ open_for_requests: open }).eq("id", shiftId).select("id"));
}

/* ---------- payslips ---------- */

export interface PayslipRow {
  id: string;
  guard_id: string;
  period_label: string;
  period_end: string;
  url: string;
}

export async function listPayslips(guardId: string): Promise<PayslipRow[]> {
  return check(await supabase.from("payslips").select("id, guard_id, period_label, period_end, url").eq("guard_id", guardId).order("period_end", { ascending: false }));
}

export async function addPayslip(p: Omit<PayslipRow, "id">) {
  check(await supabase.from("payslips").insert(p).select("id"));
}

export async function deletePayslip(id: string) {
  check(await supabase.from("payslips").delete().eq("id", id).select("id"));
}

/* ====================== admin dashboard, part 2 ====================== */

/* ---------- compliance ---------- */

export type Compliance = "valid" | "expiring" | "blocked";

export interface ComplianceResult {
  status: Compliance;
  reasons: string[];
}

const KIND_LABEL: Record<string, string> = {
  sia_licence: "SIA licence",
  dbs: "DBS",
  vetting: "Vetting",
  first_aid: "First aid",
  training: "Training",
  right_to_work: "Right to work",
  driving_licence: "Driving licence",
  other: "Document",
};
export const kindLabel = (k: string) => KIND_LABEL[k] ?? k;

export const daysUntil = (date: string | null) => {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.now()) / 86_400_000) + 1;
};

/**
 * An officer's compliance from their documents. BLOCKED: no verified,
 * in-date SIA licence, or a document a site requires is missing/expired.
 * EXPIRING: anything verified expires within 60 days. Otherwise VALID.
 */
export function compliance(docs: DocumentRow[], required: string[] = []): ComplianceResult {
  const live = docs.filter((d) => d.verified_at && !d.rejected_reason);
  const best = (kind: string) =>
    live.filter((d) => d.kind === kind).sort((a, b) => (b.expires_on ?? "9999").localeCompare(a.expires_on ?? "9999"))[0];
  const reasons: string[] = [];
  let status: Compliance = "valid";
  for (const kind of new Set(["sia_licence", ...required])) {
    const d = best(kind);
    const left = d ? daysUntil(d.expires_on) : null;
    if (!d) {
      reasons.push(`No verified ${kindLabel(kind)}`);
      status = "blocked";
    } else if (left != null && left < 0) {
      reasons.push(`${kindLabel(kind)} expired`);
      status = "blocked";
    }
  }
  if (status !== "blocked") {
    for (const d of live) {
      const left = daysUntil(d.expires_on);
      if (left != null && left >= 0 && left <= 60) {
        reasons.push(`${d.title} expires in ${left} day${left === 1 ? "" : "s"}`);
        status = "expiring";
      }
    }
  }
  return { status, reasons };
}

export async function markRenewed(id: string, adminId: string, expires_on: string) {
  check(await supabase.from("officer_documents").update({ expires_on, verified_at: new Date().toISOString(), verified_by: adminId, rejected_reason: null }).eq("id", id).select("id"));
}

/** Sends the officer a direct message asking for the renewed document. */
export async function sendReminder(adminId: string, guardId: string, doc: DocumentRow) {
  const left = daysUntil(doc.expires_on);
  const when = left == null ? "" : left < 0 ? " has expired" : ` expires in ${left} day${left === 1 ? "" : "s"}`;
  await sendMessage({
    sender_id: adminId,
    audience: "officer",
    site_id: null,
    recipient_id: guardId,
    subject: `${doc.title} renewal`,
    body: `Your ${doc.title}${when}. Please upload the renewed document under Documents in the officers app as soon as you have it.`,
    requires_ack: true,
  });
}

/** Records that an admin opened a private file, then returns a short-lived link. */
export async function viewFile(bucket: string, path: string, entity: string, entityId: string, summary: string) {
  await supabase.rpc("log_view", { p_entity: entity, p_entity_id: entityId, p_summary: summary });
  return signed(bucket, path, 300);
}

/* ---------- rota ---------- */

export async function publishShifts(ids: string[]) {
  if (!ids.length) return;
  check(await supabase.from("shifts").update({ published: true }).in("id", ids).select("id"));
}

export async function updateShift(id: string, fields: Partial<{ starts_at: string; ends_at: string; guards_required: number; notes: string | null; site_id: string; published: boolean }>) {
  check(await supabase.from("shifts").update(fields).eq("id", id).select("id"));
}

/* ---------- site contacts ---------- */

export interface SiteContact {
  id: string;
  site_id: string;
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  call_order: number;
  emergency: boolean;
  notes: string | null;
}

export async function listSiteContacts(siteId?: string): Promise<SiteContact[]> {
  let q = supabase.from("site_contacts").select("id, site_id, name, role, phone, email, call_order, emergency, notes").order("call_order").order("name");
  if (siteId) q = q.eq("site_id", siteId);
  return check(await q);
}

export async function saveSiteContact(c: Omit<SiteContact, "id"> & { id?: string }) {
  const { id, ...fields } = c;
  if (id) check(await supabase.from("site_contacts").update(fields).eq("id", id).select("id"));
  else check(await supabase.from("site_contacts").insert(fields).select("id"));
}

export async function deleteSiteContact(id: string) {
  check(await supabase.from("site_contacts").delete().eq("id", id).select("id"));
}

export async function saveSiteRequirements(siteId: string, required_documents: string[], requirements: string | null) {
  check(await supabase.from("sites").update({ required_documents, requirements }).eq("id", siteId).select("id"));
}

export async function loadSiteRequirements(): Promise<Record<string, { required_documents: string[]; requirements: string | null }>> {
  const rows = check(await supabase.from("sites").select("id, required_documents, requirements")) as Row[];
  return Object.fromEntries(rows.map((r) => [r.id, { required_documents: r.required_documents ?? [], requirements: r.requirements }]));
}

/* ---------- pay rates ---------- */

export interface PayRate {
  id: string;
  guard_id: string;
  hourly_rate: number;
  effective_from: string;
  notes: string | null;
}

export async function listPayRates(guardId?: string): Promise<PayRate[]> {
  let q = supabase.from("officer_pay_rates").select("id, guard_id, hourly_rate, effective_from, notes").order("effective_from", { ascending: false });
  if (guardId) q = q.eq("guard_id", guardId);
  return (check(await q) as Row[]).map((r) => ({ ...r, hourly_rate: Number(r.hourly_rate) }));
}

export async function addPayRate(r: Omit<PayRate, "id">) {
  check(await supabase.from("officer_pay_rates").insert(r).select("id"));
}

/** The rate in force on a given date. */
export const rateOn = (rates: PayRate[], guardId: string, date: string) =>
  rates.filter((r) => r.guard_id === guardId && r.effective_from <= date).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]?.hourly_rate ?? null;

/* ---------- incidents: notes, assign, share ---------- */

export interface IncidentNote {
  id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  client_visible: boolean;
}

export async function listIncidentNotes(incidentId: string): Promise<IncidentNote[]> {
  return check(await supabase.from("incident_notes").select("id, author_name, body, created_at, client_visible").eq("incident_id", incidentId).order("created_at"));
}

export async function addIncidentNote(incidentId: string, adminId: string, body: string, clientVisible = false) {
  check(await supabase.from("incident_notes").insert({ incident_id: incidentId, author_id: adminId, body, client_visible: clientVisible }).select("id"));
}

export async function updateIncident(
  id: string,
  fields: Partial<{ status: string; assigned_to: string | null; shared_with_client: boolean; shared_at: string | null; client_summary: string | null; reviewed_by: string; reviewed_at: string }>,
) {
  check(await supabase.from("incidents").update(fields).eq("id", id).select("id"));
}

export async function listAdmins(): Promise<{ id: string; name: string }[]> {
  const rows = check(await supabase.from("profiles").select("id, full_name, email").eq("role", "admin").eq("active", true).order("full_name")) as Row[];
  return rows.map((r) => ({ id: r.id, name: nameOf(r) }));
}

/* ---------- alerts: escalate ---------- */

export async function escalateAlert(id: string, adminId: string, note: string) {
  check(
    await supabase
      .from("alerts")
      .update({ escalated_at: new Date().toISOString(), escalated_by: adminId, escalation_note: note || null })
      .eq("id", id)
      .select("id"),
  );
}

/* ---------- audit log ---------- */

export interface AuditRow {
  id: number;
  at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  summary: string | null;
  changes: Record<string, unknown> | null;
}

export async function listAudit(f: { fromIso: string; toIso: string; actor?: string; action?: string; entity?: string; entityId?: string; limit?: number }): Promise<AuditRow[]> {
  let q = supabase
    .from("audit_log")
    .select("id, at, actor_id, actor_name, action, entity, entity_id, summary, changes")
    .gte("at", f.fromIso)
    .lt("at", f.toIso)
    .order("at", { ascending: false })
    .limit(f.limit ?? 1000);
  if (f.actor) q = q.eq("actor_id", f.actor);
  if (f.action) q = q.eq("action", f.action);
  if (f.entity) q = q.eq("entity", f.entity);
  if (f.entityId) q = q.eq("entity_id", f.entityId);
  return check(await q);
}

/* ---------- users and roles ---------- */

export interface UserRow {
  id: string;
  full_name: string;
  email: string | null;
  role: "guard" | "admin" | "client";
  active: boolean;
  created_at: string;
}

export async function listUsers(): Promise<UserRow[]> {
  return check(await supabase.from("profiles").select("id, full_name, email, role, active, created_at").order("role").order("full_name").limit(5000));
}

export async function setRole(id: string, role: UserRow["role"]) {
  check(await supabase.from("profiles").update({ role }).eq("id", id).select("id"));
}

/** Removes a user's 2-step verification (needs the `admin-users` Edge Function). */
export async function resetMfa(userId: string) {
  const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "reset_mfa", user_id: userId } });
  if (error) throw new Error("Couldn't reset 2-step verification. Check the admin-users function is deployed.");
  return data as { removed: number };
}

/* ---------- csv ---------- */

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    // A leading = + - @ would run as a formula in Excel; neutralise it.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- client requests (control-room tasks) ---------- */

export interface ClientRequestRow {
  id: string;
  client_name: string;
  site_name: string | null;
  kind: "extra_patrol" | "expected_visitor" | "access_issue" | "other";
  details: string;
  wanted_at: string | null;
  status: "open" | "in_progress" | "done" | "declined";
  response: string | null;
  created_at: string;
  requested_by: string;
}

export const REQUEST_KIND: Record<ClientRequestRow["kind"], string> = {
  extra_patrol: "Extra patrol",
  expected_visitor: "Expected visitor",
  access_issue: "Access issue",
  other: "Other",
};

export async function listClientRequests(openOnly: boolean): Promise<ClientRequestRow[]> {
  let q = supabase
    .from("client_requests")
    .select("id, kind, details, wanted_at, status, response, created_at, clients(name), sites(name), profiles!client_requests_created_by_fkey(full_name, email)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (openOnly) q = q.in("status", ["open", "in_progress"]);
  return (check(await q) as Row[]).map((r) => ({
    ...r,
    client_name: r.clients?.name ?? "—",
    site_name: r.sites?.name ?? null,
    requested_by: nameOf(r.profiles),
  }));
}

export async function updateClientRequest(id: string, adminId: string, status: ClientRequestRow["status"], response: string | null) {
  check(
    await supabase
      .from("client_requests")
      .update({ status, response, handled_by: adminId, handled_at: new Date().toISOString() })
      .eq("id", id)
      .select("id"),
  );
}

/* ---------- incident photos released to the client ---------- */

export interface ClientPhoto {
  id: string;
  source_id: string | null;
  path: string;
}

export async function listClientPhotos(incidentId: string): Promise<ClientPhoto[]> {
  return check(await supabase.from("incident_client_photos").select("id, source_id, path").eq("incident_id", incidentId).order("created_at"));
}

/**
 * Releases one photo to the client: downloads the officer's original,
 * re-draws it in the browser (which drops all EXIF metadata, including
 * GPS) and stores the copy in the client-only bucket under the incident.
 */
export async function releasePhoto(incidentId: string, media: { id: string; path: string }) {
  const { data: blob, error } = await supabase.storage.from("incident-media").download(media.path);
  if (error || !blob) throw new Error("Couldn't read the original photo.");
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const clean = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!clean) throw new Error("Couldn't prepare the photo.");
  const path = `${incidentId}/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from("client-media").upload(path, clean, { contentType: "image/jpeg", upsert: false });
  if (up.error) throw new Error(up.error.message);
  check(await supabase.from("incident_client_photos").insert({ incident_id: incidentId, source_id: media.id, path }).select("id"));
}

export async function withdrawPhoto(p: ClientPhoto) {
  check(await supabase.from("incident_client_photos").delete().eq("id", p.id).select("id"));
  await supabase.storage.from("client-media").remove([p.path]);
}

/* ---------- guard profile ---------- */

export interface GuardShift {
  assignment_id: string;
  status: string;
  site_name: string;
  starts_at: string;
  ends_at: string;
  approved_minutes: number | null;
}

export async function listGuardShifts(guardId: string, fromIso: string, toIso: string): Promise<GuardShift[]> {
  const rows = check(
    await supabase
      .from("shift_assignments")
      .select("id, status, approved_minutes, shifts!inner(starts_at, ends_at, sites(name))")
      .eq("guard_id", guardId)
      .gte("shifts.starts_at", fromIso)
      .lt("shifts.starts_at", toIso)
      .limit(500),
  ) as Row[];
  return rows
    .map((r) => ({ assignment_id: r.id, status: r.status, approved_minutes: r.approved_minutes, site_name: r.shifts?.sites?.name ?? "—", starts_at: r.shifts.starts_at, ends_at: r.shifts.ends_at }))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at));
}

/** Audit entries about one officer: their profile, plus records that name them. */
export async function listAuditForGuard(guardId: string): Promise<AuditRow[]> {
  return check(
    await supabase
      .from("audit_log")
      .select("id, at, actor_id, actor_name, action, entity, entity_id, summary, changes")
      .or(`entity_id.eq.${guardId},changes->>guard_id.eq.${guardId},actor_id.eq.${guardId}`)
      .order("at", { ascending: false })
      .limit(300),
  );
}

/* ---------- client reports: daily, monthly, patrol notes ---------- */

export interface DailyReport {
  id: string;
  site_id: string;
  report_date: string;
  summary: string;
  visitors: number | null;
  vehicles: number | null;
  key_events: string | null;
  status: "draft" | "approved";
  approved_at: string | null;
}

export async function listDailyReports(siteId: string, from: string, to: string): Promise<DailyReport[]> {
  return check(
    await supabase
      .from("daily_reports")
      .select("id, site_id, report_date, summary, visitors, vehicles, key_events, status, approved_at")
      .eq("site_id", siteId)
      .gte("report_date", from)
      .lte("report_date", to)
      .order("report_date", { ascending: false }),
  );
}

export async function saveDailyReport(r: Omit<DailyReport, "id" | "approved_at"> & { id?: string }, adminId: string) {
  const { id, ...fields } = r;
  const extra = fields.status === "approved" ? { approved_by: adminId, approved_at: new Date().toISOString() } : { approved_by: null, approved_at: null };
  if (id) check(await supabase.from("daily_reports").update({ ...fields, ...extra }).eq("id", id).select("id"));
  else check(await supabase.from("daily_reports").upsert({ ...fields, ...extra }, { onConflict: "site_id,report_date" }).select("id"));
}

/** A first draft of a day's summary, from the occurrence book, patrols and incidents. */
export async function draftDailyReport(siteId: string, date: string, fromIso: string, toIso: string) {
  const [log, patrols, incidents] = await Promise.all([
    listLog(siteId, fromIso, toIso),
    listPatrols(siteId, fromIso, toIso),
    check(await supabase.from("incidents").select("title, severity, occurred_at").eq("site_id", siteId).gte("occurred_at", fromIso).lt("occurred_at", toIso)) as Row[],
  ]);
  const visitors = log.filter((e) => e.kind === "visitor_in").length;
  const vehicles = log.filter((e) => e.kind === "vehicle_in").length;
  const done = patrols.filter((p) => p.ended_at && !p.checkpoints_missed).length;
  const events: string[] = [];
  for (const e of log.filter((e) => e.kind === "alarm")) events.push(`Alarm: ${e.body}`.slice(0, 200));
  for (const e of log.filter((e) => e.kind === "key_out")) events.push(`Key ${e.details?.key ?? ""} signed out to ${e.subject ?? "—"}`);
  for (const i of incidents) events.push(`Incident (${i.severity}): ${i.title}`);
  const summary =
    `${done} patrol${done === 1 ? "" : "s"} completed. ${visitors} visitor${visitors === 1 ? "" : "s"} and ${vehicles} vehicle${vehicles === 1 ? "" : "s"} recorded.` +
    (incidents.length ? ` ${incidents.length} incident${incidents.length === 1 ? "" : "s"} reported.` : " No incidents.");
  return { site_id: siteId, report_date: date, summary, visitors, vehicles, key_events: events.join("\n") || null, status: "draft" as const };
}

export interface MonthlyReport {
  id: string;
  client_id: string;
  month: string;
  summary: string;
  figures: Record<string, { site: string; shifts: number; shifts_covered: number; patrols: number; incidents: number }>;
  status: "draft" | "approved";
  approved_at: string | null;
}

export async function listMonthlyReports(clientId: string): Promise<MonthlyReport[]> {
  return check(
    await supabase.from("monthly_reports").select("id, client_id, month, summary, figures, status, approved_at").eq("client_id", clientId).order("month", { ascending: false }),
  );
}

export async function saveMonthlyReport(r: Omit<MonthlyReport, "id" | "approved_at"> & { id?: string }, adminId: string) {
  const { id, ...fields } = r;
  const extra = fields.status === "approved" ? { approved_by: adminId, approved_at: new Date().toISOString() } : { approved_by: null, approved_at: null };
  if (id) check(await supabase.from("monthly_reports").update({ ...fields, ...extra }).eq("id", id).select("id"));
  else check(await supabase.from("monthly_reports").upsert({ ...fields, ...extra }, { onConflict: "client_id,month" }).select("id"));
}

export interface PatrolDayNote {
  site_id: string;
  day: string;
  note: string;
  shared: boolean;
}

export async function listPatrolDayNotes(siteId: string, from: string, to: string): Promise<PatrolDayNote[]> {
  return check(await supabase.from("patrol_day_notes").select("site_id, day, note, shared").eq("site_id", siteId).gte("day", from).lte("day", to));
}

export async function savePatrolDayNote(n: PatrolDayNote) {
  check(await supabase.from("patrol_day_notes").upsert({ ...n, updated_at: new Date().toISOString() }, { onConflict: "site_id,day" }).select("site_id"));
}

export async function setPatrolClientNote(patrolId: string, note: string | null, shared: boolean) {
  check(await supabase.from("patrols").update({ client_note: note, client_shared: shared }).eq("id", patrolId).select("id"));
}

/* ---------- per-client settings ---------- */

export const CLIENT_SECTIONS: { key: string; label: string }[] = [
  { key: "status", label: "Site status" },
  { key: "patrols", label: "Patrol history" },
  { key: "incidents", label: "Incident reports" },
  { key: "daily", label: "Daily summaries" },
  { key: "monthly", label: "Monthly reports" },
  { key: "requests", label: "Requests" },
  { key: "contact", label: "Contact" },
];

export interface ClientSettings {
  client_id: string;
  sections: string[];
  control_room_phone: string | null;
  account_manager_name: string | null;
  account_manager_phone: string | null;
  account_manager_email: string | null;
  share_names: boolean;
  share_locations: boolean;
  share_attendance: boolean;
}

export async function loadClientSettings(clientId: string): Promise<ClientSettings> {
  const { data, error } = await supabase.from("client_settings").select("*").eq("client_id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  return (
    (data as ClientSettings) ?? {
      client_id: clientId,
      sections: CLIENT_SECTIONS.map((s) => s.key),
      control_room_phone: null,
      account_manager_name: null,
      account_manager_phone: null,
      account_manager_email: null,
      share_names: true,
      share_locations: false,
      share_attendance: false,
    }
  );
}

export async function saveClientSettings(s: ClientSettings) {
  check(await supabase.from("client_settings").upsert(s, { onConflict: "client_id" }).select("client_id"));
}
