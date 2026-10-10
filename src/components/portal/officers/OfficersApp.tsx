import { useCallback, useEffect, useState } from "react";
import PortalShell from "../PortalShell";
import { Loading, Notice } from "../ui";
import type { Assignment, ClockEvent, Profile } from "../../../lib/portalSupabase";
import { loadAssignments, loadClockEvents } from "./data";
import OfficerHome from "./OfficerHome";
import ShiftDetail from "./ShiftDetail";

/**
 * Officers portal (officers.harleygarrison.co.uk). One page; screens are
 * switched by the URL hash (`#/shift/<assignment id>`), so the back
 * button works and no server-side routing is needed.
 */
export default function OfficersApp() {
  return (
    <PortalShell
      portalName="Officers"
      tagline="Your shifts, sites and instructions, and clocking in and out."
      role="guard"
    >
      {({ profile, signOut }) => <Officer profile={profile} signOut={signOut} />}
    </PortalShell>
  );
}

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

function Officer({ profile, signOut }: { profile: Profile; signOut: () => Promise<void> }) {
  const hash = useHashRoute();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [events, setEvents] = useState<Record<string, ClockEvent[]>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await loadAssignments(profile.id);
      const ev = await loadClockEvents(list.filter((a) => a.status === "accepted").map((a) => a.id));
      setAssignments(list);
      setEvents(ev);
      setError(null);
    } catch {
      setError("Your shifts couldn't be loaded. Check your connection and try again.");
    }
  }, [profile.id]);

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const detailId = hash.match(/^#\/shift\/([0-9a-f-]{36})$/)?.[1];
  const firstName = profile.full_name.split(" ")[0] || "officer";

  return (
    <div className="min-h-dvh">
      <header className="border-hairline border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-gutter py-4">
          <a href="#/" aria-label="My shifts">
            <img src="/logo/logo-horizontal.svg" alt="Harley Garrison" width="141" height="32" className="h-8 w-auto" />
          </a>
          <div className="flex items-center gap-5">
            <span className="text-caption text-stone hidden sm:inline">{profile.full_name}</span>
            <button
              type="button"
              onClick={signOut}
              className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-gutter pt-10 pb-24">
        {error && (
          <div className="mb-8">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        {assignments === null && !error ? (
          <Loading label="Loading your shifts" />
        ) : detailId ? (
          <ShiftDetail
            assignmentId={detailId}
            officerId={profile.id}
            initial={assignments?.find((a) => a.id === detailId) ?? null}
            onChanged={refresh}
          />
        ) : (
          <OfficerHome firstName={firstName} assignments={assignments ?? []} events={events} onChanged={refresh} />
        )}
      </main>
    </div>
  );
}
