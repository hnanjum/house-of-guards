import { useCallback, useEffect, useState, type ReactNode } from "react";
import PortalShell from "../PortalShell";
import { Notice } from "../ui";
import type { Assignment, ClockEvent, Profile } from "../../../lib/portalSupabase";
import { IconCalendar, IconClock, IconExit, IconOverview, IconUser } from "../admin/icons";
import { loadAssignments, loadClockEvents } from "./data";
import Home from "./OfficerHome";
import MyShifts from "./MyShifts";
import ShiftDetail from "./ShiftDetail";
import Timesheet from "./Timesheet";
import ProfilePage from "./ProfilePage";

/**
 * Officers portal (officers.harleygarrison.co.uk), laid out like the
 * admin and client dashboards:
 *  - desktop (lg+): the same Ink sidebar as the admin dashboard;
 *  - phones: an Ink top bar with the logo, and a fixed bottom tab bar
 *    (Home / My shifts / Timesheet / Profile), the pattern officers know
 *    from banking and delivery apps. The active tab carries an Amber
 *    top mark plus full-strength text, never colour alone.
 * Screens switch by URL hash so the phone's back button works.
 */

const NAV = [
  { href: "#/", key: "", label: "Home", Icon: IconOverview },
  { href: "#/shifts", key: "shifts", label: "My shifts", Icon: IconCalendar },
  { href: "#/timesheet", key: "timesheet", label: "Timesheet", Icon: IconClock },
  { href: "#/profile", key: "profile", label: "Profile", Icon: IconUser },
];

export default function OfficersApp() {
  return (
    <PortalShell portalName="Officers" tagline="Your shifts, sites and instructions, and clocking in and out." role="guard">
      {({ profile, signOut }) => <Officer profile={profile} signOut={signOut} />}
    </PortalShell>
  );
}

function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/");
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => {
      setParts(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export function Officer({ profile, signOut }: { profile: Profile; signOut: () => Promise<void> }) {
  const [section, param] = useRoute();
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

  const active = section === "shift" ? "shifts" : section ?? "";
  const firstName = profile.full_name.split(" ")[0] || "officer";

  let page: ReactNode;
  if (section === "shift" && param && /^[0-9a-f-]{36}$/.test(param)) {
    page = <ShiftDetail assignmentId={param} officerId={profile.id} initial={assignments?.find((a) => a.id === param) ?? null} onChanged={refresh} />;
  } else if (section === "shifts") {
    page = <MyShifts officerId={profile.id} assignments={assignments} events={events} onChanged={refresh} />;
  } else if (section === "timesheet") {
    page = <Timesheet officerId={profile.id} />;
  } else if (section === "profile") {
    page = <ProfilePage profile={profile} signOut={signOut} />;
  } else {
    page = <Home officerId={profile.id} firstName={firstName} assignments={assignments} events={events} onChanged={refresh} />;
  }

  return (
    <div className="bg-surface-alt min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Phone top bar */}
      <div className="on-dark bg-ink text-paper sticky top-0 z-30 flex items-center justify-between px-gutter py-3 lg:hidden">
        <img src="/logo/logo-white.svg" alt="Harley Garrison" width="118" height="32" className="h-8 w-auto" />
        <span className="text-caption text-paper/70 truncate pl-4">{profile.full_name}</span>
      </div>

      {/* Desktop sidebar */}
      <aside className="on-dark bg-ink text-paper sticky top-0 hidden h-dvh flex-col lg:flex" aria-label="Officer navigation">
        <div className="px-6 pt-7 pb-8">
          <img src="/logo/logo-white.svg" alt="Harley Garrison" width="148" height="40" className="h-9 w-auto" />
          <p className="text-micro text-paper/60 mt-3">Officers</p>
        </div>
        <nav className="flex-1 px-3">
          <ul className="space-y-1">
            {NAV.map(({ href, key, label, Icon }) => {
              const on = active === key;
              return (
                <li key={key}>
                  <a
                    href={href}
                    aria-current={on ? "page" : undefined}
                    className={`text-caption relative flex min-h-11 items-center gap-3 px-3 transition-colors ${
                      on ? "bg-paper/10 text-paper" : "text-paper/70 hover:bg-paper/5 hover:text-paper"
                    }`}
                  >
                    {on && <span className="bg-amber absolute inset-y-2 left-0 w-0.5" aria-hidden="true" />}
                    <Icon />
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-paper/10 border-t px-6 py-5">
          <p className="text-caption text-paper truncate">{profile.full_name || "Officer"}</p>
          <p className="text-micro text-paper/60">Security officer</p>
          <button type="button" onClick={signOut} className="text-caption text-paper/70 hover:text-paper mt-4 inline-flex items-center gap-2">
            <IconExit width={16} height={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 pb-24 lg:pb-0">
        {error && (
          <div className="px-gutter pt-6 md:px-10">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        {page}
      </main>

      {/* Phone bottom tab bar */}
      <nav
        aria-label="Officer navigation"
        className="border-hairline bg-paper fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-4">
          {NAV.map(({ href, key, label, Icon }) => {
            const on = active === key;
            return (
              <li key={key}>
                <a
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={`text-micro relative flex min-h-16 flex-col items-center justify-center gap-1 ${on ? "text-ink" : "text-stone"}`}
                >
                  {on && <span className="bg-amber absolute inset-x-6 top-0 h-0.5" aria-hidden="true" />}
                  <Icon width={22} height={22} />
                  {label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
