import { supabase, type Assignment, type AssignmentStatus, type ClockEvent, type SiteInstruction } from "../../../lib/portalSupabase";

/**
 * Data access for the officers portal. Every query relies on Row Level
 * Security to scope results to the signed-in officer; the explicit
 * `guard_id` filters are for index use and clarity, not security.
 */

const SHIFT_FIELDS =
  "id, status, shifts!inner(id, starts_at, ends_at, notes, sites(id, name, address, latitude, longitude, geofence_radius_m))";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAssignment(row: any): Assignment {
  const s = row.shifts;
  return {
    id: row.id,
    status: row.status,
    shift: { id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, notes: s.notes, site: s.sites },
  };
}

/** Offered and accepted shifts that haven't finished more than 12 hours ago. */
export async function loadAssignments(officerId: string): Promise<Assignment[]> {
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
  const { data, error } = await supabase.from("shift_assignments").select(SHIFT_FIELDS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toAssignment(data) : null;
}

export async function loadClockEvents(assignmentIds: string[]): Promise<Record<string, ClockEvent[]>> {
  const out: Record<string, ClockEvent[]> = {};
  if (!assignmentIds.length) return out;
  const { data, error } = await supabase
    .from("clock_events")
    .select("id, type, server_time, within_geofence, distance_to_site_m, assignment_id")
    .in("assignment_id", assignmentIds)
    .order("server_time", { ascending: true });
  if (error) throw error;
  for (const row of data ?? []) (out[row.assignment_id] ??= []).push(row as ClockEvent);
  return out;
}

export async function loadInstructions(siteId: string): Promise<SiteInstruction[]> {
  const { data, error } = await supabase
    .from("site_instructions")
    .select("id, title, body")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
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
export function readPosition(): Promise<{ position: Position | null; reason?: string }> {
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
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

export async function clock(
  assignmentId: string,
  officerId: string,
  type: "in" | "out",
  position: Position | null,
): Promise<ClockEvent> {
  const { data, error } = await supabase
    .from("clock_events")
    .insert({
      id: crypto.randomUUID(),
      assignment_id: assignmentId,
      guard_id: officerId,
      type,
      device_time: new Date().toISOString(),
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      accuracy_m: position?.accuracy ?? null,
      offline: false,
    })
    .select("id, type, server_time, within_geofence, distance_to_site_m")
    .single();
  if (error) throw error;
  return data as ClockEvent;
}

/** Clock-in opens 60 minutes before the shift starts and closes when it ends. */
export const CLOCK_IN_OPENS_MIN = 60;

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
