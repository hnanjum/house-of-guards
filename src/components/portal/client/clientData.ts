import { supabase } from "../../../lib/portalSupabase";

/**
 * Data for the client portal — ONLY through the database's client-visible
 * functions (supabase/migrations, part 3). A client login can't read any
 * table directly. Those functions return only what the office has
 * released, for the client's own sites, and never officer ids, full
 * names, selfies, alerts, pay, rota or compliance. Officer names
 * ("Ahmed N."), locations and attendance times appear only if the
 * office switched them on for this client.
 *
 * `clientId` is only used when an administrator previews a client's
 * portal ("Preview as client"); for a client login the database ignores
 * it and uses their own company.
 */

const args = (clientId: string | null | undefined, rest: Record<string, unknown> = {}) => ({ ...rest, p_client: clientId ?? null });

async function call<T>(fn: string, params: Record<string, unknown>): Promise<T[]> {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

export type Section = "status" | "patrols" | "incidents" | "daily" | "monthly" | "requests" | "contact";

export interface ClientProfile {
  client_id: string;
  client_name: string;
  sections: Section[];
  control_room_phone: string | null;
  account_manager_name: string | null;
  account_manager_phone: string | null;
  account_manager_email: string | null;
  share_names: boolean;
  share_locations: boolean;
  share_attendance: boolean;
}

export async function loadProfile(clientId?: string | null): Promise<ClientProfile | null> {
  return (await call<ClientProfile>("client_profile", args(clientId)))[0] ?? null;
}

export interface SiteStatus {
  site_id: string;
  site_name: string;
  address: string;
  status: "covered" | "needs_attention";
  shifts_this_week: number;
  shifts_covered_this_week: number;
  officers_on_site: string[] | null;
}

export const loadSiteStatus = (clientId?: string | null) => call<SiteStatus>("client_site_status", args(clientId));

export interface PatrolDay {
  site_id: string;
  site_name: string;
  day: string;
  completed: number;
  expected: number | null;
  note: string | null;
}

export const loadPatrolDays = (from: string, to: string, clientId?: string | null) => call<PatrolDay>("client_patrol_days", args(clientId, { p_from: from, p_to: to }));

export interface Patrol {
  patrol_id: string;
  site_id: string;
  site_name: string;
  officer: string | null;
  started_at: string;
  ended_at: string;
  checkpoints_total: number | null;
  checkpoints_done: number;
  note: string | null;
  scans: { checkpoint: string; at: string; lat?: number; lng?: number }[];
}

export const loadPatrols = (from: string, to: string, clientId?: string | null) => call<Patrol>("client_patrols", args(clientId, { p_from: from, p_to: to }));

export interface ClientIncident {
  incident_id: string;
  site_id: string;
  site_name: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  occurred_at: string;
  reported_at: string;
  status: string;
  police_ref: string | null;
  client_summary: string | null;
  officer: string | null;
  lat: number | null;
  lng: number | null;
  photos: string[];
  timeline: { at: string; text: string }[];
}

export const loadIncidents = (from: string, to: string, clientId?: string | null) => call<ClientIncident>("client_incidents", args(clientId, { p_from: from, p_to: to }));

export interface DailySummary {
  report_id: string;
  site_id: string;
  site_name: string;
  report_date: string;
  summary: string;
  visitors: number | null;
  vehicles: number | null;
  key_events: string | null;
}

export const loadDaily = (from: string, to: string, clientId?: string | null) => call<DailySummary>("client_daily_reports", args(clientId, { p_from: from, p_to: to }));

export interface MonthlySummary {
  report_id: string;
  month: string;
  summary: string;
  figures: Record<string, { site: string; shifts: number; shifts_covered: number; patrols: number; incidents: number }>;
  approved_at: string;
}

export const loadMonthly = (clientId?: string | null) => call<MonthlySummary>("client_monthly_reports", args(clientId));

export interface AttendanceRow {
  site_id: string;
  site_name: string;
  starts_at: string;
  ends_at: string;
  officer: string;
  arrived: string | null;
  arrived_on_site: boolean | null;
  left_at: string | null;
  left_on_site: boolean | null;
}

export const loadAttendance = (from: string, to: string, clientId?: string | null) => call<AttendanceRow>("client_attendance", args(clientId, { p_from: from, p_to: to }));

export interface ClientRequest {
  request_id: string;
  site_name: string | null;
  kind: "extra_patrol" | "expected_visitor" | "access_issue" | "other";
  details: string;
  wanted_at: string | null;
  status: "open" | "in_progress" | "done" | "declined";
  response: string | null;
  created_at: string;
}

export const loadRequests = (clientId?: string | null) => call<ClientRequest>("client_request_list", args(clientId));

export async function raiseRequest(siteId: string | null, kind: ClientRequest["kind"], details: string, wantedAt: string | null) {
  const { error } = await supabase.rpc("client_raise_request", { p_site: siteId, p_kind: kind, p_details: details, p_wanted_at: wantedAt });
  if (error) throw new Error(error.message);
}

/** Short-lived link to a photo released to the client (EXIF removed). */
export async function photoUrl(path: string) {
  const { data } = await supabase.storage.from("client-media").createSignedUrl(path, 1800);
  return data?.signedUrl ?? null;
}
