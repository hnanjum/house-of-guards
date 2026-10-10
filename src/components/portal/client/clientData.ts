import { supabase } from "../../../lib/portalSupabase";

/**
 * Data for the client portal. Everything about officers comes through the
 * `client_roster` database function, which only ever returns the
 * signed-in client's own sites and shows officers as first name + last
 * initial. Clients cannot query officer profiles directly (RLS).
 */

export interface RosterOfficer {
  assignment_id: string;
  name: string;
  clock_in: string | null;
  clock_in_on_site: boolean | null;
  clock_out: string | null;
  clock_out_on_site: boolean | null;
}

export interface RosterShift {
  id: string;
  site_id: string;
  site_name: string;
  starts_at: string;
  ends_at: string;
  required: number;
  officers: RosterOfficer[];
}

export async function loadRoster(from: Date, to: Date): Promise<RosterShift[]> {
  const { data, error } = await supabase.rpc("client_roster", { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(error.message);
  const byShift = new Map<string, RosterShift>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    let s = byShift.get(r.shift_id);
    if (!s) {
      s = {
        id: r.shift_id,
        site_id: r.site_id,
        site_name: r.site_name,
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        required: r.guards_required,
        officers: [],
      };
      byShift.set(r.shift_id, s);
    }
    if (r.assignment_id) {
      s.officers.push({
        assignment_id: r.assignment_id,
        name: r.officer_name ?? "Officer",
        clock_in: r.clock_in,
        clock_in_on_site: r.clock_in_on_site,
        clock_out: r.clock_out,
        clock_out_on_site: r.clock_out_on_site,
      });
    }
  }
  return [...byShift.values()];
}

export async function loadMyClient(): Promise<string | null> {
  const { data } = await supabase.from("clients").select("name").limit(1).maybeSingle();
  return data?.name ?? null;
}

export interface ClientSite {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export async function loadSites(): Promise<ClientSite[]> {
  const { data, error } = await supabase.from("sites").select("id, name, address, latitude, longitude").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type OfficerState = "due" | "on-duty" | "finished" | "late" | "missed";

export function officerState(shift: RosterShift, o: RosterOfficer, now = Date.now()): OfficerState {
  if (o.clock_out) return "finished";
  if (o.clock_in) return "on-duty";
  const start = Date.parse(shift.starts_at);
  if (now > Date.parse(shift.ends_at)) return "missed";
  if (now > start + 10 * 60_000) return "late";
  return "due";
}

/** Hours between clock-in and clock-out, or null if not both recorded. */
export function hoursWorked(o: RosterOfficer): number | null {
  if (!o.clock_in || !o.clock_out) return null;
  return Math.max(0, (Date.parse(o.clock_out) - Date.parse(o.clock_in)) / 3_600_000);
}

export const fmtHours = (h: number) => {
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return mins === 60 ? `${whole + 1}h 00m` : `${whole}h ${String(mins).padStart(2, "0")}m`;
};
