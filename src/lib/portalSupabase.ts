import { createClient } from "@supabase/supabase-js";

/**
 * Supabase connection for the portals. Both values are PUBLIC by design:
 * the publishable key only identifies the project, and every table is
 * protected by Row Level Security (supabase/migrations/). The secret /
 * service-role key must never appear anywhere in this repository.
 *
 * Browser-only: imported from `client:only` React islands. Sessions live
 * in localStorage per origin, so each portal subdomain keeps its own
 * sign-in.
 */
export const SUPABASE_URL = "https://jhacbfhxgodqumgxfnvr.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_7qk9JBFGVMxb6MIBNbeMgA_sh5JidRP";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export type UserRole = "guard" | "admin" | "client";
export type AssignmentStatus = "offered" | "accepted" | "declined" | "cancelled";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  active: boolean;
}

export interface Site {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  geofence_radius_m: number;
  contact_name: string | null;
  contact_phone: string | null;
  patrol_interval_min: number | null;
  welfare_interval_min: number | null;
  selfie_required: boolean;
}

export interface Shift {
  id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  site: Site;
}

export interface Assignment {
  id: string;
  status: AssignmentStatus;
  shift: Shift;
  approved_minutes: number | null;
  approved_at: string | null;
}

export interface ClockEvent {
  id: string;
  type: "in" | "out";
  server_time: string;
  within_geofence: boolean | null;
  distance_to_site_m: number | null;
  schedule_offset_min?: number | null;
  selfie_path?: string | null;
  /** Saved on the phone, not yet received by the server. */
  pending?: boolean;
}

export type InstructionCategory = "post_orders" | "emergency" | "fire" | "access" | "general";

export interface SiteInstruction {
  id: string;
  title: string;
  body: string;
  category: InstructionCategory;
  file_path: string | null;
  file_name: string | null;
}
