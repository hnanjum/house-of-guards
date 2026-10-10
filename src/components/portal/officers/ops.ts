import { supabase } from "../../../lib/portalSupabase";
import { cached, listOutbox, send } from "./offline";
import { compressImage, extFor, uploadNow } from "./media";
import { posFields, type Position } from "./data";

/**
 * Officer operations beyond clocking: patrols, welfare check-ins, panic,
 * incident reports, the occurrence book (notes, handovers, visitors,
 * vehicles, keys), checklists, messages, documents, policies, extra
 * shifts and payslips. Everything an officer records on shift goes
 * through `send()`, so it works with no signal.
 */

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/* ====================== patrols ====================== */

export interface Checkpoint {
  id: string;
  name: string;
  sort_order: number;
}

export interface ScanRow {
  id: string;
  checkpoint_id: string | null;
  checkpoint_name?: string;
  scanned_at: string;
  in_order: boolean | null;
  pending?: boolean;
}

export interface PatrolRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  checkpoints_total: number | null;
  checkpoints_missed: number | null;
  scans: ScanRow[];
  pending?: boolean;
}

export async function loadCheckpoints(assignmentId: string): Promise<Checkpoint[]> {
  return cached(`checkpoints.${assignmentId}`, async () => check(await supabase.rpc("site_checkpoints", { p_assignment: assignmentId })) ?? []);
}

/** Patrols on this shift, newest first, plus any still waiting on the phone. */
export async function loadPatrols(assignmentId: string): Promise<PatrolRow[]> {
  const rows = await cached(`patrols.${assignmentId}`, async () =>
    check(
      await supabase
        .from("patrols")
        .select("id, started_at, ended_at, checkpoints_total, checkpoints_missed, checkpoint_scans(id, checkpoint_id, scanned_at, in_order)")
        .eq("assignment_id", assignmentId)
        .order("started_at", { ascending: false })
        .limit(50),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: PatrolRow[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    checkpoints_total: r.checkpoints_total,
    checkpoints_missed: r.checkpoints_missed,
    scans: [...(r.checkpoint_scans ?? [])].sort((a: ScanRow, b: ScanRow) => a.scanned_at.localeCompare(b.scanned_at)),
  }));
  // Merge items queued offline.
  for (const item of await listOutbox()) {
    if (item.error) continue;
    const p = item.payload as Record<string, string>;
    if (item.target === "start_patrol" && p.p_assignment === assignmentId && !list.some((x) => x.id === p.p_id)) {
      list.unshift({ id: p.p_id, started_at: p.p_device_time, ended_at: null, checkpoints_total: null, checkpoints_missed: null, scans: [], pending: true });
    }
  }
  for (const item of await listOutbox()) {
    if (item.error) continue;
    const p = item.payload as Record<string, string>;
    const patrol = list.find((x) => x.id === p.p_patrol);
    if (!patrol) continue;
    if (item.target === "scan_checkpoint" && !patrol.scans.some((s) => s.id === p.p_id)) {
      patrol.scans.push({ id: p.p_id, checkpoint_id: null, scanned_at: p.p_device_time, in_order: null, pending: true });
    }
    if (item.target === "end_patrol" && !patrol.ended_at) patrol.ended_at = p.p_device_time;
  }
  return list;
}

export async function startPatrol(assignmentId: string, siteName: string) {
  const id = uid();
  await send({
    id,
    label: `Patrol started · ${siteName}`,
    kind: "rpc",
    target: "start_patrol",
    payload: { p_id: id, p_assignment: assignmentId, p_device_time: now(), p_offline: false },
    offlineKey: "p_offline",
  });
  return id;
}

export interface ScanResult {
  checkpoint_name: string;
  in_order: boolean;
  expected_name: string | null;
  scanned: number;
  total: number;
  repeat: boolean;
}

/** Returns the server's verdict, or null if saved to send later. */
export async function scanCheckpoint(patrolId: string, code: string, position: Position | null): Promise<ScanResult | null> {
  const id = uid();
  const res = await send<ScanResult[]>({
    id,
    label: "Checkpoint scan",
    kind: "rpc",
    target: "scan_checkpoint",
    payload: {
      p_id: id,
      p_patrol: patrolId,
      p_code: code,
      p_device_time: now(),
      p_latitude: position?.latitude ?? null,
      p_longitude: position?.longitude ?? null,
      p_accuracy: position?.accuracy ?? null,
      p_offline: false,
    },
    offlineKey: "p_offline",
  });
  return res.queued ? null : (res.data?.[0] ?? null);
}

export async function endPatrol(patrolId: string) {
  await send({
    id: uid(),
    label: "Patrol ended",
    kind: "rpc",
    target: "end_patrol",
    payload: { p_patrol: patrolId, p_device_time: now(), p_offline: false },
    offlineKey: "p_offline",
  });
}

/* ====================== welfare & panic ====================== */

export async function lastWelfareCheck(assignmentId: string): Promise<string | null> {
  let latest: string | null = null;
  try {
    const rows = await cached(`welfare.${assignmentId}`, async () =>
      check(await supabase.from("welfare_checks").select("checked_at").eq("assignment_id", assignmentId).order("checked_at", { ascending: false }).limit(1)),
    );
    latest = rows?.[0]?.checked_at ?? null;
  } catch {
    latest = null;
  }
  for (const item of await listOutbox()) {
    const p = item.payload as Record<string, string>;
    if (item.target === "welfare_checks" && p.assignment_id === assignmentId && (!latest || p.device_time > latest)) latest = p.device_time;
  }
  return latest;
}

export async function welfareCheckIn(assignmentId: string, officerId: string, position: Position | null, siteName: string) {
  const id = uid();
  return send({
    id,
    label: `Welfare check-in · ${siteName}`,
    kind: "insert",
    target: "welfare_checks",
    payload: { id, assignment_id: assignmentId, guard_id: officerId, device_time: now(), ...posFields(position), offline: false },
    offlineKey: "offline",
  });
}

export async function raisePanic(assignmentId: string | null, position: Position | null, note: string | null) {
  const id = uid();
  const res = await send({
    id,
    label: "PANIC ALERT",
    kind: "rpc",
    target: "raise_panic",
    payload: {
      p_id: id,
      p_assignment: assignmentId,
      p_device_time: now(),
      p_latitude: position?.latitude ?? null,
      p_longitude: position?.longitude ?? null,
      p_accuracy: position?.accuracy ?? null,
      p_note: note,
      p_offline: false,
    },
    offlineKey: "p_offline",
  });
  return { id, queued: res.queued };
}

export interface MyAlert {
  id: string;
  kind: string;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution: string | null;
  details: string | null;
}

export async function loadAlert(id: string): Promise<MyAlert | null> {
  const { data } = await supabase.from("alerts").select("id, kind, created_at, acknowledged_at, resolved_at, resolution, details").eq("id", id).maybeSingle();
  return (data as MyAlert) ?? null;
}

/** My alerts from the last 12 hours that control hasn't closed yet. */
export async function loadMyOpenAlerts(): Promise<MyAlert[]> {
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data } = await supabase
    .from("alerts")
    .select("id, kind, created_at, acknowledged_at, resolved_at, resolution, details")
    .gte("created_at", since)
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  return (data as MyAlert[]) ?? [];
}

/* ====================== incidents ====================== */

export const INCIDENT_CATEGORIES: { value: string; label: string }[] = [
  { value: "theft", label: "Theft or attempted theft" },
  { value: "trespass", label: "Trespass or unauthorised entry" },
  { value: "damage", label: "Criminal damage" },
  { value: "aggression", label: "Violence, threats or abuse" },
  { value: "suspicious", label: "Suspicious person, vehicle or item" },
  { value: "fire_alarm", label: "Fire or alarm activation" },
  { value: "medical", label: "Medical or first aid" },
  { value: "health_safety", label: "Health and safety hazard" },
  { value: "access", label: "Access, lock-up or key problem" },
  { value: "other", label: "Other" },
];

export const SEVERITIES: { value: string; label: string; note: string }[] = [
  { value: "low", label: "Low", note: "For the record" },
  { value: "medium", label: "Medium", note: "Office should review" },
  { value: "high", label: "High", note: "Control alerted now" },
  { value: "critical", label: "Critical", note: "Control alerted now" },
];

export const categoryLabel = (v: string) => INCIDENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;

export interface IncidentInput {
  site_id: string;
  site_name: string;
  assignment_id: string | null;
  category: string;
  severity: string;
  title: string;
  description: string;
  occurred_at: string;
  police_ref: string | null;
  people: string | null;
  position: Position | null;
  files: File[];
}

/** Returns true if it went straight to control, false if it's waiting for signal. */
export async function submitIncident(officerId: string, input: IncidentInput): Promise<boolean> {
  const id = uid();
  const media: { path: string; blob: Blob; type: string }[] = [];
  let n = 0;
  for (const f of input.files) {
    n++;
    const isImage = f.type.startsWith("image/") && f.type !== "image/heic";
    const blob = isImage ? await compressImage(f) : f;
    const type = isImage ? "image/jpeg" : f.type || "application/octet-stream";
    media.push({ path: `${officerId}/${id}/${n}.${extFor(type)}`, blob, type });
  }
  const res = await send({
    id,
    label: `Incident report · ${input.title}`,
    kind: "insert",
    target: "incidents",
    payload: {
      id,
      guard_id: officerId,
      assignment_id: input.assignment_id,
      site_id: input.site_id,
      category: input.category,
      severity: input.severity,
      title: input.title,
      description: input.description,
      occurred_at: input.occurred_at,
      device_time: now(),
      ...posFields(input.position),
      police_ref: input.police_ref,
      people: input.people,
      offline: false,
    },
    offlineKey: "offline",
    files: media.map((m) => ({ bucket: "incident-media", path: m.path, blob: m.blob, contentType: m.type })),
  });
  let queued = res.queued;
  for (const m of media) {
    const mid = uid();
    const r = await send({
      id: mid,
      label: "Incident photo/video",
      kind: "insert",
      target: "incident_media",
      payload: { id: mid, incident_id: id, guard_id: officerId, path: m.path, mime: m.type, size_bytes: m.blob.size },
    });
    queued = queued || r.queued;
  }
  return !queued;
}

export interface MyIncident {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  occurred_at: string;
  site_name: string;
  media: number;
  pending?: boolean;
}

export async function loadMyIncidents(): Promise<MyIncident[]> {
  const rows = await cached("my-incidents", async () =>
    check(
      await supabase
        .from("incidents")
        .select("id, title, category, severity, status, occurred_at, sites(name), incident_media(id)")
        .order("occurred_at", { ascending: false })
        .limit(50),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: MyIncident[] = (rows ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    severity: r.severity,
    status: r.status,
    occurred_at: r.occurred_at,
    site_name: r.sites?.name ?? "",
    media: r.incident_media?.length ?? 0,
  }));
  for (const item of await listOutbox()) {
    if (item.target !== "incidents" || item.error) continue;
    const p = item.payload as Record<string, string>;
    if (!list.some((x) => x.id === p.id)) {
      list.unshift({ id: p.id, title: p.title, category: p.category, severity: p.severity, status: "waiting", occurred_at: p.occurred_at, site_name: "", media: item.files?.length ?? 0, pending: true });
    }
  }
  return list;
}

/* ====================== occurrence book ====================== */

export type LogKind = "note" | "handover" | "visitor_in" | "visitor_out" | "vehicle_in" | "vehicle_out" | "key_out" | "key_in" | "alarm";

export interface LogEntry {
  id: string;
  kind: LogKind;
  subject: string | null;
  body: string;
  details: Record<string, string>;
  ref_id: string | null;
  key_id: string | null;
  occurred_at: string;
  author_name: string | null;
  guard_id: string;
  offline?: boolean;
  pending?: boolean;
}

export const LOG_KIND_LABEL: Record<LogKind, string> = {
  note: "Note",
  handover: "Handover",
  visitor_in: "Visitor in",
  visitor_out: "Visitor out",
  vehicle_in: "Vehicle in",
  vehicle_out: "Vehicle out",
  key_out: "Key out",
  key_in: "Key returned",
  alarm: "Alarm",
};

/** The site's book for the last `days` days, newest first, with entries still on the phone. */
export async function loadLog(siteId: string, days = 2): Promise<LogEntry[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows = await cached(`log.${siteId}.${days}`, async () =>
    check(
      await supabase
        .from("log_entries")
        .select("id, kind, subject, body, details, ref_id, key_id, occurred_at, author_name, guard_id, offline")
        .eq("site_id", siteId)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(500),
    ),
  );
  const list = [...((rows ?? []) as LogEntry[])];
  for (const item of await listOutbox()) {
    if (item.target !== "log_entries" || item.error) continue;
    const p = item.payload as unknown as LogEntry & { site_id: string; device_time: string };
    if (p.site_id !== siteId || list.some((x) => x.id === p.id)) continue;
    list.unshift({ ...p, occurred_at: p.device_time, author_name: "You", pending: true });
  }
  return list.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/** Entries still open: visitors/vehicles in with no matching "out". */
export function stillOnSite(entries: LogEntry[], inKind: "visitor_in" | "vehicle_in", outKind: "visitor_out" | "vehicle_out") {
  const closed = new Set(entries.filter((e) => e.kind === outKind && e.ref_id).map((e) => e.ref_id));
  return entries.filter((e) => e.kind === inKind && !closed.has(e.id));
}

export interface SiteKey {
  id: string;
  label: string;
  notes: string | null;
}

export async function loadKeys(siteId: string): Promise<SiteKey[]> {
  return cached(`keys.${siteId}`, async () =>
    check(await supabase.from("site_keys").select("id, label, notes").eq("site_id", siteId).eq("active", true).order("label")),
  );
}

/** Latest key movement per key (to know who has what). */
export async function loadKeyMovements(siteId: string): Promise<LogEntry[]> {
  const rows = await cached(`keymoves.${siteId}`, async () =>
    check(
      await supabase
        .from("log_entries")
        .select("id, kind, subject, body, details, ref_id, key_id, occurred_at, author_name, guard_id")
        .eq("site_id", siteId)
        .in("kind", ["key_out", "key_in"])
        .order("occurred_at", { ascending: false })
        .limit(500),
    ),
  );
  const list = [...((rows ?? []) as LogEntry[])];
  for (const item of await listOutbox()) {
    if (item.target !== "log_entries" || item.error) continue;
    const p = item.payload as unknown as LogEntry & { site_id: string; device_time: string };
    if (p.site_id === siteId && (p.kind === "key_out" || p.kind === "key_in")) list.unshift({ ...p, occurred_at: p.device_time, pending: true });
  }
  return list.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

export async function addLogEntry(
  officerId: string,
  e: { site_id: string; assignment_id: string; kind: LogKind; subject?: string | null; body?: string; details?: Record<string, string>; ref_id?: string | null; key_id?: string | null },
) {
  const id = uid();
  return send({
    id,
    label: `${LOG_KIND_LABEL[e.kind]}${e.subject ? ` · ${e.subject}` : ""}`,
    kind: "insert",
    target: "log_entries",
    payload: {
      id,
      site_id: e.site_id,
      assignment_id: e.assignment_id,
      guard_id: officerId,
      kind: e.kind,
      subject: e.subject?.trim() || null,
      body: e.body?.trim() ?? "",
      details: e.details ?? {},
      ref_id: e.ref_id ?? null,
      key_id: e.key_id ?? null,
      device_time: now(),
      offline: false,
    },
    offlineKey: "offline",
  });
}

/* ====================== checklists ====================== */

export interface Checklist {
  id: string;
  site_id: string | null;
  kind: "equipment" | "site";
  name: string;
  items: string[];
  prompt_at: "clock_in" | "clock_out" | "any";
}

export interface ChecklistResult {
  item: string;
  ok: boolean;
  note?: string;
}

export async function loadChecklists(siteId: string): Promise<Checklist[]> {
  return cached(`checklists.${siteId}`, async () =>
    check(
      await supabase
        .from("checklists")
        .select("id, site_id, kind, name, items, prompt_at")
        .or(`site_id.is.null,site_id.eq.${siteId}`)
        .order("sort_order")
        .order("name"),
    ),
  );
}

export interface Submission {
  id: string;
  checklist_id: string;
  completed_at: string;
  issues: number | null;
  pending?: boolean;
}

export async function loadSubmissions(assignmentId: string): Promise<Submission[]> {
  const rows = await cached(`submissions.${assignmentId}`, async () =>
    check(
      await supabase
        .from("checklist_submissions")
        .select("id, checklist_id, completed_at, issues")
        .eq("assignment_id", assignmentId)
        .order("completed_at", { ascending: false }),
    ),
  );
  const list = [...((rows ?? []) as Submission[])];
  for (const item of await listOutbox()) {
    if (item.target !== "checklist_submissions" || item.error) continue;
    const p = item.payload as Record<string, unknown>;
    if (p.assignment_id === assignmentId && !list.some((x) => x.id === p.id)) {
      const results = p.results as ChecklistResult[];
      list.unshift({ id: String(p.id), checklist_id: String(p.checklist_id), completed_at: String(p.device_time), issues: results.filter((r) => !r.ok).length, pending: true });
    }
  }
  return list;
}

export async function submitChecklist(officerId: string, a: { assignment_id: string; site_id: string }, list: Checklist, results: ChecklistResult[], notes: string) {
  const id = uid();
  return send({
    id,
    label: `${list.name} completed`,
    kind: "insert",
    target: "checklist_submissions",
    payload: { id, checklist_id: list.id, assignment_id: a.assignment_id, guard_id: officerId, site_id: a.site_id, results, notes: notes.trim() || null, device_time: now(), offline: false },
    offlineKey: "offline",
  });
}

/* ====================== messages ====================== */

export interface Message {
  id: string;
  subject: string;
  body: string;
  audience: "all" | "site" | "officer";
  requires_ack: boolean;
  created_at: string;
  read_at: string | null;
  acknowledged_at: string | null;
}

export async function loadMessages(): Promise<Message[]> {
  const rows = await cached("messages", async () =>
    check(
      await supabase
        .from("messages")
        .select("id, subject, body, audience, requires_ack, created_at, message_receipts(read_at, acknowledged_at)")
        .order("created_at", { ascending: false })
        .limit(200),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => ({
    id: r.id,
    subject: r.subject,
    body: r.body,
    audience: r.audience,
    requires_ack: r.requires_ack,
    created_at: r.created_at,
    read_at: r.message_receipts?.[0]?.read_at ?? null,
    acknowledged_at: r.message_receipts?.[0]?.acknowledged_at ?? null,
  }));
}

export async function markRead(messageId: string, officerId: string) {
  const { error } = await supabase.from("message_receipts").insert({ message_id: messageId, guard_id: officerId });
  if (error && error.code !== "23505") throw error;
}

export async function acknowledgeMessage(messageId: string, officerId: string) {
  await markRead(messageId, officerId);
  check(await supabase.from("message_receipts").update({ acknowledged_at: now() }).eq("message_id", messageId).eq("guard_id", officerId).select("message_id"));
}

/* ====================== documents ====================== */

export const DOC_KINDS: { value: string; label: string; expires: boolean }[] = [
  { value: "sia_licence", label: "SIA licence", expires: true },
  { value: "dbs", label: "DBS certificate", expires: true },
  { value: "vetting", label: "Vetting (BS 7858)", expires: true },
  { value: "first_aid", label: "First aid certificate", expires: true },
  { value: "training", label: "Training certificate", expires: true },
  { value: "right_to_work", label: "Right to work", expires: true },
  { value: "driving_licence", label: "Driving licence", expires: true },
  { value: "other", label: "Other", expires: false },
];

export const docKindLabel = (v: string) => DOC_KINDS.find((k) => k.value === v)?.label ?? v;

export interface OfficerDocument {
  id: string;
  kind: string;
  title: string;
  reference: string | null;
  issued_on: string | null;
  expires_on: string | null;
  file_path: string | null;
  file_name: string | null;
  uploaded_at: string;
  verified_at: string | null;
  rejected_reason: string | null;
}

export async function loadDocuments(): Promise<OfficerDocument[]> {
  return cached("documents", async () =>
    check(
      await supabase
        .from("officer_documents")
        .select("id, kind, title, reference, issued_on, expires_on, file_path, file_name, uploaded_at, verified_at, rejected_reason")
        .order("uploaded_at", { ascending: false }),
    ),
  );
}

/** Documents need a connection (they're sent to the office for checking). */
export async function addDocument(
  officerId: string,
  d: { kind: string; title: string; reference: string | null; issued_on: string | null; expires_on: string | null },
  file: File | null,
) {
  const id = uid();
  let file_path: string | null = null;
  let file_name: string | null = null;
  if (file) {
    const isImage = file.type.startsWith("image/");
    const blob = isImage ? await compressImage(file, 2000, 0.85) : file;
    const type = isImage ? "image/jpeg" : file.type;
    file_path = `${officerId}/${id}.${extFor(type)}`;
    file_name = file.name;
    await uploadNow("officer-documents", file_path, blob, type);
  }
  check(await supabase.from("officer_documents").insert({ id, guard_id: officerId, ...d, file_path, file_name }).select("id"));
}

export async function deleteDocument(doc: OfficerDocument) {
  check(await supabase.from("officer_documents").delete().eq("id", doc.id).select("id"));
  if (doc.file_path) await supabase.storage.from("officer-documents").remove([doc.file_path]);
}

/** Days until expiry (negative = expired), or null if no date. */
export function daysLeft(date: string | null): number | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.now()) / 86_400_000) + 1;
}

/** Reminders for the home screen: missing SIA licence, or anything expiring within 60 days. */
export function documentReminders(docs: OfficerDocument[]): string[] {
  const out: string[] = [];
  const live = docs.filter((d) => !d.rejected_reason);
  if (!live.some((d) => d.kind === "sia_licence")) out.push("Add your SIA licence to your documents.");
  const latest = new Map<string, OfficerDocument>();
  for (const d of live) {
    const prev = latest.get(d.kind + d.title);
    if (!prev || (d.expires_on ?? "") > (prev.expires_on ?? "")) latest.set(d.kind + d.title, d);
  }
  for (const d of latest.values()) {
    const left = daysLeft(d.expires_on);
    if (left == null) continue;
    if (left < 0) out.push(`Your ${d.title} has expired. Upload the renewed one.`);
    else if (left <= 60) out.push(`Your ${d.title} expires in ${left} day${left === 1 ? "" : "s"}. Upload the renewal when you have it.`);
  }
  for (const d of docs) if (d.rejected_reason) out.push(`The office couldn't accept your ${d.title}: ${d.rejected_reason}`);
  return out;
}

/* ====================== policies & training ====================== */

export interface Policy {
  id: string;
  kind: "policy" | "training";
  title: string;
  summary: string | null;
  body: string;
  link_url: string | null;
  version: number;
  requires_ack: boolean;
  updated_at: string;
  acked_version: number | null;
  acked_at: string | null;
}

export async function loadPolicies(): Promise<Policy[]> {
  const rows = await cached("policies", async () =>
    check(
      await supabase
        .from("policies")
        .select("id, kind, title, summary, body, link_url, version, requires_ack, updated_at, policy_acks(version, acked_at)")
        .order("sort_order")
        .order("title"),
    ),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => {
    const ack = (r.policy_acks ?? []).find((a: { version: number }) => a.version === r.version);
    return { ...r, acked_version: ack?.version ?? null, acked_at: ack?.acked_at ?? null, policy_acks: undefined };
  });
}

export async function acknowledgePolicy(policy: Policy, officerId: string) {
  const { error } = await supabase.from("policy_acks").insert({ policy_id: policy.id, guard_id: officerId, version: policy.version });
  if (error && error.code !== "23505") throw error;
}

/* ====================== extra shifts ====================== */

export interface OpenShift {
  id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  site_name: string;
  site_address: string;
  request: { id: string; status: string } | null;
}

export async function loadOpenShifts(officerId: string): Promise<OpenShift[]> {
  const rows = check(
    await supabase
      .from("shifts")
      .select("id, starts_at, ends_at, notes, sites(name, address), shift_requests(id, status), shift_assignments(guard_id, status)")
      .eq("open_for_requests", true)
      .gt("starts_at", now())
      .order("starts_at")
      .limit(100),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? [])
    .filter((r: any) => !(r.shift_assignments ?? []).some((a: { guard_id: string; status: string }) => a.guard_id === officerId && a.status === "accepted"))
    .map((r: any) => ({
      id: r.id,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      notes: r.notes,
      site_name: r.sites?.name ?? "Site",
      site_address: r.sites?.address ?? "",
      request: r.shift_requests?.[0] ?? null,
    }));
}

export async function requestShift(shiftId: string, officerId: string, note: string | null) {
  check(await supabase.from("shift_requests").insert({ shift_id: shiftId, guard_id: officerId, note }).select("id"));
}

export async function setRequestStatus(requestId: string, status: "withdrawn" | "pending") {
  check(await supabase.from("shift_requests").update({ status }).eq("id", requestId).select("id"));
}

/* ====================== payslips ====================== */

export interface Payslip {
  id: string;
  period_label: string;
  period_end: string;
  url: string;
}

export async function loadPayslips(): Promise<Payslip[]> {
  return check(await supabase.from("payslips").select("id, period_label, period_end, url").order("period_end", { ascending: false }).limit(60));
}
