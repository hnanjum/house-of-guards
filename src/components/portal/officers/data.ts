import { supabase, type Assignment, type AssignmentStatus, type ClockEvent, type SiteInstruction } from "../../../lib/portalSupabase";
import { cached, listOutbox, send } from "./offline";
import { compressImage } from "./media";

/**
 * Data access for the officers portal. Every query relies on Row Level
 * Security to scope results to the signed-in officer; the explicit
 * `guard_id` filters are for index use and clarity, not security.
 *
 * Reads that an officer may need with no signal go through `cached()`;
 * records made on shift go through `send()` (see offline.ts).
 */

const SITE_FIELDS = "id, name, address, latitude, longitude, geofence_radius_m, contact_name, contact_phone, patrol_interval_min, welfare_interval_min, selfie_required";
const SHIFT_FIELDS = `id, status, approved_minutes, approved_at, shifts!inner(id, starts_at, ends_at, notes, sites(${SITE_FIELDS}))`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAssignment(row: any): Assignment {
  const s = row.shifts;
  return {
    id: row.id,
    status: row.status,
    approved_minutes: row.approved_minutes ?? null,
    approved_at: row.approved_at ?? null,
    shift: { id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, notes: s.notes, site: s.sites },
  };
}

/** Offered and accepted shifts that haven't finished more than 12 hours ago. */
export async function loadAssignments(officerId: string): Promise<Assignment[]> {
  return cached(`${officerId}.assignments`, async () => {
    const since = new Date(Date.now() - 12 * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("shift_assignments")
      .select(SHIFT_FIELDS)
      .eq("guard_id", officerId)
      .in("status", ["offered", "accepted"])
      .gte("shifts.ends_at", since)
      .limit(100);
    if (error) throw error;
    return (data ?? []).map(toAssignment).sort((a, b) => a.shift.starts_at.localeCompare(b.shift.starts_at));
  });
}

/** Accepted shifts that started in [from, to) — the officer's history. */
export async function loadWorked(officerId: string, from: Date, to: Date): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from("shift_assignments")
    .select(SHIFT_FIELDS)
    .eq("guard_id", officerId)
    .eq("status", "accepted")
    .gte("shifts.starts_at", from.toISOString())
    .lt("shifts.starts_at", to.toISOString())
    .limit(500);
  if (error) throw error;
  return (data ?? []).map(toAssignment).sort((x, y) => y.shift.starts_at.localeCompare(x.shift.starts_at));
}

/** Clocked hours for one assignment: first clock-in to last clock-out. */
export function hoursFor(events: ClockEvent[] | undefined): number | null {
  const ins = events?.filter((e) => e.type === "in") ?? [];
  const outs = events?.filter((e) => e.type === "out") ?? [];
  if (!ins.length || !outs.length) return null;
  return Math.max(0, (Date.parse(outs.at(-1)!.server_time) - Date.parse(ins[0].server_time)) / 3_600_000);
}

export async function updateMyPhone(officerId: string, phone: string | null) {
  const { data, error } = await supabase.from("profiles").update({ phone }).eq("id", officerId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Not saved");
}

export async function loadMyEmail(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

export async function loadAssignment(id: string): Promise<Assignment | null> {
  return cached(`assignment.${id}`, async () => {
    const { data, error } = await supabase.from("shift_assignments").select(SHIFT_FIELDS).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toAssignment(data) : null;
  });
}

/**
 * Clock events per assignment, including any still waiting on the phone
 * to be sent (marked `pending`, timed by the phone's clock), so the duty
 * state is right even with no signal.
 */
export async function loadClockEvents(assignmentIds: string[]): Promise<Record<string, ClockEvent[]>> {
  const out: Record<string, ClockEvent[]> = {};
  if (!assignmentIds.length) return out;
  const rows = await cached(`clock.${[...assignmentIds].sort().join(",").slice(0, 400)}`, async () => {
    const { data, error } = await supabase
      .from("clock_events")
      .select("id, type, server_time, within_geofence, distance_to_site_m, assignment_id, schedule_offset_min, selfie_path")
      .in("assignment_id", assignmentIds)
      .order("server_time", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });
  for (const row of rows) (out[row.assignment_id] ??= []).push(row as ClockEvent);
  const seen = new Set(rows.map((r) => r.id));
  for (const item of await listOutbox()) {
    if (item.target !== "clock_events" || item.error) continue;
    const p = item.payload as { id: string; assignment_id: string; type: "in" | "out"; device_time: string };
    if (!assignmentIds.includes(p.assignment_id) || seen.has(p.id)) continue;
    (out[p.assignment_id] ??= []).push({ id: p.id, type: p.type, server_time: p.device_time, within_geofence: null, distance_to_site_m: null, pending: true });
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.server_time.localeCompare(b.server_time));
  return out;
}

export async function loadInstructions(siteId: string): Promise<SiteInstruction[]> {
  return cached(`instructions.${siteId}`, async () => {
    const { data, error } = await supabase
      .from("site_instructions")
      .select("id, title, body, category, file_path, file_name")
      .eq("site_id", siteId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []) as SiteInstruction[];
  });
}

export async function respond(assignmentId: string, status: Extract<AssignmentStatus, "accepted" | "declined">) {
  const { data, error } = await supabase.from("shift_assignments").update({ status }).eq("id", assignmentId).select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("This shift can no longer be changed.");
}

export interface Position {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** One high-accuracy GPS reading. Resolves null (with a reason) instead of throwing. */
export function readPosition(timeout = 15_000): Promise<{ position: Position | null; reason?: string }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ position: null, reason: "This device can't share its location." });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ position: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy } }),
      (err) =>
        resolve({
          position: null,
          reason:
            err.code === err.PERMISSION_DENIED
              ? "Location access is turned off for this site."
              : "Your location couldn't be found. Move somewhere with a clearer view of the sky and try again.",
        }),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
  });
}

/** Quick, best-effort position for reports and logs (never blocks for long). */
export async function quickPosition(): Promise<Position | null> {
  return (await readPosition(8_000)).position;
}

export const posFields = (p: Position | null) => ({
  latitude: p?.latitude ?? null,
  longitude: p?.longitude ?? null,
  accuracy_m: p?.accuracy ?? null,
});

/**
 * Clock in or out. The selfie (if any) is shrunk and sent with it; with
 * no signal the whole thing waits on the phone and is sent later.
 * Returns the server's record, or null if it was saved to send later.
 */
export async function clock(
  assignmentId: string,
  officerId: string,
  type: "in" | "out",
  position: Position | null,
  selfie: Blob | null,
  label: string,
): Promise<ClockEvent | null> {
  const id = crypto.randomUUID();
  const photo = selfie ? await compressImage(selfie, 900, 0.75) : null;
  const selfiePath = photo ? `${officerId}/${id}.jpg` : null;
  const payload = {
    id,
    assignment_id: assignmentId,
    guard_id: officerId,
    type,
    device_time: new Date().toISOString(),
    ...posFields(position),
    selfie_path: selfiePath,
    offline: false,
  };
  const res = await send({
    id,
    label,
    kind: "insert",
    target: "clock_events",
    payload,
    offlineKey: "offline",
    files: photo ? [{ bucket: "clock-selfies", path: selfiePath!, blob: photo, contentType: "image/jpeg" }] : undefined,
  });
  if (res.queued) return null;
  const { data } = await supabase
    .from("clock_events")
    .select("id, type, server_time, within_geofence, distance_to_site_m, schedule_offset_min, selfie_path")
    .eq("id", id)
    .maybeSingle();
  return (data as ClockEvent) ?? { id, type, server_time: payload.device_time, within_geofence: null, distance_to_site_m: null };
}

/** Clock-in opens 60 minutes before the shift starts and closes when it ends. */
export const CLOCK_IN_OPENS_MIN = 60;

/** Minutes either side of the booked time before a clock is flagged late/early. */
export const PUNCTUAL_MIN = 5;

export type DutyState = "not-yet" | "can-clock-in" | "on-duty" | "done" | "missed";

export function dutyState(a: Assignment, events: ClockEvent[] | undefined, now = Date.now()): DutyState {
  const last = events?.at(-1);
  if (last?.type === "in") return "on-duty";
  if (last?.type === "out") return "done";
  const start = Date.parse(a.shift.starts_at);
  const end = Date.parse(a.shift.ends_at);
  if (now < start - CLOCK_IN_OPENS_MIN * 60_000) return "not-yet";
  if (now <= end) return "can-clock-in";
  return "missed";
}

/** "12 min late", "8 min early", or null when within the allowance. */
export function punctuality(e: Pick<ClockEvent, "type" | "schedule_offset_min">): string | null {
  const m = e.schedule_offset_min;
  if (m == null || Math.abs(m) <= PUNCTUAL_MIN) return null;
  const amount = Math.abs(m) >= 90 ? `${Math.round((Math.abs(m) / 60) * 10) / 10} h` : `${Math.abs(m)} min`;
  if (e.type === "in") return m > 0 ? `${amount} late` : `${amount} early`;
  return m < 0 ? `left ${amount} early` : `${amount} after the booked end`;
}
