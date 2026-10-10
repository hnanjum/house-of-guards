import { supabase, type AssignmentStatus } from "../../../lib/portalSupabase";

/**
 * Data access for the admin dashboard. Admin rights come from RLS
 * (`private.is_admin()`); nothing here is trusted on its own.
 */

export interface Officer {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
}

export interface SiteRow {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
  active: boolean;
  client_id: string | null;
}

export interface Instruction {
  id: string;
  site_id: string;
  title: string;
  body: string;
  sort_order: number;
}

export interface AssignmentRow {
  id: string;
  status: AssignmentStatus;
  guard_id: string;
  officer_name: string;
}

export interface ShiftRow {
  id: string;
  site_id: string;
  site_name: string;
  starts_at: string;
  ends_at: string;
  guards_required: number;
  notes: string | null;
  assignments: AssignmentRow[];
}

export interface ClockRow {
  id: string;
  assignment_id: string;
  type: "in" | "out";
  server_time: string;
  device_time: string;
  within_geofence: boolean | null;
  distance_to_site_m: number | null;
  officer_name: string;
  site_name: string;
}

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/* ---------- officers ---------- */

export async function listOfficers(): Promise<Officer[]> {
  return check(
    await supabase
      .from("profiles")
      .select("id, full_name, email, phone, active, created_at")
      .eq("role", "guard")
      .order("full_name")
      .limit(2000),
  );
}

export async function setOfficerActive(id: string, active: boolean) {
  check(await supabase.from("profiles").update({ active }).eq("id", id).select("id"));
}

export async function updateOfficer(id: string, fields: { full_name: string; phone: string | null }) {
  check(await supabase.from("profiles").update(fields).eq("id", id).select("id"));
}

/** Creates the account via the `invite-user` Edge Function and returns a one-time link. */
export async function inviteUser(input: { email: string; full_name: string; role: "guard" | "client"; client_id?: string | null }) {
  const { data, error } = await supabase.functions.invoke("invite-user", { body: input });
  if (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context as Response | undefined;
    let message = "The invite couldn't be created. Check the invite-user function is deployed.";
    try {
      const body = ctx ? await ctx.json() : null;
      if (body?.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return data as { user_id: string; invite_url: string };
}

/* ---------- clients ---------- */

export async function listClients(): Promise<Client[]> {
  return check(await supabase.from("clients").select("id, name").order("name"));
}

export interface ClientUser {
  client_id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  active: boolean;
}

export async function listClientUsers(): Promise<ClientUser[]> {
  const rows = check(await supabase.from("client_users").select("client_id, user_id, profiles(full_name, email, active)"));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => ({
    client_id: r.client_id,
    user_id: r.user_id,
    full_name: r.profiles?.full_name ?? "",
    email: r.profiles?.email ?? null,
    active: r.profiles?.active ?? false,
  }));
}

export async function createClient(name: string) {
  check(await supabase.from("clients").insert({ name }).select("id"));
}

/* ---------- sites ---------- */

export async function listSites(): Promise<SiteRow[]> {
  return check(
    await supabase
      .from("sites")
      .select("id, name, address, latitude, longitude, geofence_radius_m, active, client_id")
      .order("name"),
  );
}

export async function saveSite(site: Omit<SiteRow, "id"> & { id?: string }) {
  const { id, ...fields } = site;
  if (id) check(await supabase.from("sites").update(fields).eq("id", id).select("id"));
  else check(await supabase.from("sites").insert(fields).select("id"));
}

export async function listInstructions(siteId: string): Promise<Instruction[]> {
  return check(
    await supabase
      .from("site_instructions")
      .select("id, site_id, title, body, sort_order")
      .eq("site_id", siteId)
      .order("sort_order"),
  );
}

export async function saveInstruction(i: { id?: string; site_id: string; title: string; body: string; sort_order: number }) {
  const { id, ...fields } = i;
  if (id) check(await supabase.from("site_instructions").update(fields).eq("id", id).select("id"));
  else check(await supabase.from("site_instructions").insert(fields).select("id"));
}

export async function deleteInstruction(id: string) {
  check(await supabase.from("site_instructions").delete().eq("id", id).select("id"));
}

/* ---------- shifts ---------- */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toShift(r: any): ShiftRow {
  return {
    id: r.id,
    site_id: r.site_id,
    site_name: r.sites?.name ?? "Unknown site",
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    guards_required: r.guards_required,
    notes: r.notes,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    assignments: (r.shift_assignments ?? []).map((a: any) => ({
      id: a.id,
      status: a.status,
      guard_id: a.guard_id,
      officer_name: a.profiles?.full_name || a.profiles?.email || "Officer",
    })),
  };
}

/** Shifts that overlap [from, to). */
export async function listShifts(fromIso: string, toIso: string): Promise<ShiftRow[]> {
  const rows = check(
    await supabase
      .from("shifts")
      .select(
        "id, site_id, starts_at, ends_at, guards_required, notes, sites(name), shift_assignments(id, status, guard_id, profiles(full_name, email))",
      )
      .lt("starts_at", toIso)
      .gt("ends_at", fromIso)
      .order("starts_at")
      .limit(1000),
  );
  return (rows ?? []).map(toShift);
}

export async function createShift(s: { site_id: string; starts_at: string; ends_at: string; guards_required: number; notes: string | null }) {
  check(await supabase.from("shifts").insert(s).select("id"));
}

export async function deleteShift(id: string) {
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) throw new Error("This shift has attendance records, so it can't be deleted. Cancel its officers instead.");
}

/** Offer a shift to an officer; re-offers a previously cancelled/declined assignment. */
export async function offerShift(shiftId: string, guardId: string) {
  check(
    await supabase
      .from("shift_assignments")
      .upsert({ shift_id: shiftId, guard_id: guardId, status: "offered" }, { onConflict: "shift_id,guard_id" })
      .select("id"),
  );
}

export async function setAssignmentStatus(id: string, status: AssignmentStatus) {
  check(await supabase.from("shift_assignments").update({ status }).eq("id", id).select("id"));
}

/* ---------- attendance ---------- */

export async function listClockEvents(sinceIso: string, assignmentIds?: string[]): Promise<ClockRow[]> {
  let q = supabase
    .from("clock_events")
    .select(
      "id, assignment_id, type, server_time, device_time, within_geofence, distance_to_site_m, profiles(full_name, email), shift_assignments(shifts(sites(name)))",
    )
    .gte("server_time", sinceIso)
    .order("server_time", { ascending: false })
    .limit(500);
  if (assignmentIds) {
    if (!assignmentIds.length) return [];
    q = q.in("assignment_id", assignmentIds);
  }
  const rows = check(await q);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows ?? []).map((r: any) => ({
    id: r.id,
    assignment_id: r.assignment_id,
    type: r.type,
    server_time: r.server_time,
    device_time: r.device_time,
    within_geofence: r.within_geofence,
    distance_to_site_m: r.distance_to_site_m,
    officer_name: r.profiles?.full_name || r.profiles?.email || "Officer",
    site_name: r.shift_assignments?.shifts?.sites?.name ?? "—",
  }));
}

/* ---------- helpers ---------- */

/*
 * All calendar maths is done in UK time (Europe/London), whatever time
 * zone the admin's own computer is set to: every site is in the UK, so
 * "07:00 on Monday" must always mean 07:00 UK time. Days are added on
 * the calendar (not as 24h), so clock changes in March/October are safe.
 */
const TZ = "Europe/London";

const partsIn = (ms: number) => {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
};

/** UK offset from UTC at an instant, in ms (0 in winter, 1h in summer). */
const offsetAt = (ms: number) => {
  const t = partsIn(ms);
  return Date.UTC(t.y, t.m - 1, t.d, t.h, t.mi, t.s) - Math.floor(ms / 1000) * 1000;
};

/** The instant at which UK wall-clock `date` + `time` occurs. */
export function ukToInstant(date: string, time = "00:00"): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms); // settle across a clock change
  return new Date(ms);
}

/** "YYYY-MM-DD" of an instant in UK time. */
export const isoDate = (d: Date) => {
  const t = partsIn(d.getTime());
  return `${t.y}-${String(t.m).padStart(2, "0")}-${String(t.d).padStart(2, "0")}`;
};

/** Midnight (UK) at the start of today. */
export const startOfToday = () => ukToInstant(isoDate(new Date()));

/** Midnight (UK) `n` calendar days after the UK day containing `d`. */
export const addDays = (d: Date, n: number) => {
  const [y, m, day] = isoDate(d).split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, day + n));
  return ukToInstant(x.toISOString().slice(0, 10));
};

/** Midnight (UK) on the Monday of the week containing `d`. */
export const weekStart = (d: Date) => {
  const [y, m, day] = isoDate(d).split("-").map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(d, -dow);
};

/** Combine a UK date ("2026-10-10") and time ("19:00") into an ISO instant. */
export const localToIso = (date: string, time: string) => ukToInstant(date, time).toISOString();

/** Attendance state of one accepted assignment on one shift. */
export function attendance(shift: ShiftRow, events: ClockRow[], now = Date.now()) {
  const mine = [...events].sort((a, b) => a.server_time.localeCompare(b.server_time));
  const last = mine.at(-1);
  const start = Date.parse(shift.starts_at);
  const end = Date.parse(shift.ends_at);
  if (last?.type === "in") return "on-duty" as const;
  if (last?.type === "out") return "complete" as const;
  if (now > end) return "no-show" as const;
  if (now > start + 10 * 60_000) return "late" as const;
  return "upcoming" as const;
}

/** Parse "53.7960, -1.7594" (as copied from Google Maps) into numbers. */
export function parseCoords(text: string): { latitude: number; longitude: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const latitude = Number(m[1]);
  const longitude = Number(m[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
