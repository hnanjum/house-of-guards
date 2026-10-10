import { useEffect, useState, type ReactNode } from "react";
import PortalShell from "../PortalShell";
import type { Profile } from "../../../lib/portalSupabase";
import { IconBuilding, IconCalendar, IconClock, IconExit, IconMenu, IconOverview, IconPeople, IconPin } from "./icons";
import Overview from "./Overview";
import Shifts from "./Shifts";
import Sites from "./Sites";
import Officers from "./Officers";
import Attendance from "./Attendance";
import Clients from "./Clients";

/**
 * Admin dashboard (admin.harleygarrison.co.uk).
 *
 * LAYOUT — the familiar admin-tool shape: a fixed left sidebar (Ink,
 * white logo, icon + label nav, the signed-in person and sign-out at the
 * foot) and a scrolling content area with a sticky top bar (page title +
 * the page's main action). Below `lg` the sidebar becomes a slide-in
 * drawer behind a menu button.
 *
 * COLOUR — sidebar is Ink with Paper text (~19.4:1) and `on-dark` focus
 * rings; the active item is marked by an Amber bar (bare mark on Ink,
 * ~9.05:1) plus a lighter row and full-strength text, so state never
 * relies on colour alone. Content is Paper; Electric Blue is the one
 * highlight colour (the overview's live panel); Amber is actions only.
 */

const NAV = [
  { href: "#/", label: "Overview", Icon: IconOverview, key: "" },
  { href: "#/shifts", label: "Shifts", Icon: IconCalendar, key: "shifts" },
  { href: "#/attendance", label: "Attendance", Icon: IconClock, key: "attendance" },
  { href: "#/officers", label: "Officers", Icon: IconPeople, key: "officers" },
  { href: "#/sites", label: "Sites", Icon: IconPin, key: "sites" },
  { href: "#/clients", label: "Clients", Icon: IconBuilding, key: "clients" },
];

export default function AdminApp() {
  return (
    <PortalShell portalName="Admin" tagline="Shifts, sites, officers and attendance in one place." role="admin">
      {({ profile, signOut }) => <Dashboard profile={profile} signOut={signOut} />}
    </PortalShell>
  );
}

function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("/");
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export function Dashboard({ profile, signOut }: { profile: Profile; signOut: () => Promise<void> }) {
  const [section, param] = useRoute();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [section, param]);

  let page: ReactNode;
  switch (section) {
    case "shifts":
      page = <Shifts />;
      break;
    case "attendance":
      page = <Attendance />;
      break;
    case "officers":
      page = <Officers />;
      break;
    case "sites":
      page = <Sites selectedId={param} />;
      break;
    case "clients":
      page = <Clients />;
      break;
    default:
      page = <Overview />;
  }

  return (
    <div className="bg-surface-alt min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Mobile top bar */}
      <div className="on-dark bg-ink text-paper sticky top-0 z-30 flex items-center justify-between px-gutter py-3 lg:hidden">
        <img src="/logo/logo-white.svg" alt="Harley Garrison" width="118" height="32" className="h-8 w-auto" />
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-label="Open menu"
          aria-expanded={drawer}
          className="inline-flex size-11 items-center justify-center"
        >
          <IconMenu />
        </button>
      </div>

      {drawer && <div className="bg-ink/50 fixed inset-0 z-40 lg:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <aside
        className={`on-dark bg-ink text-paper fixed inset-y-0 left-0 z-50 flex w-64 flex-col transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Admin navigation"
      >
        <div className="px-6 pt-7 pb-8">
          <img src="/logo/logo-white.svg" alt="Harley Garrison" width="148" height="40" className="h-9 w-auto" />
          <p className="text-micro text-paper/60 mt-3">Operations</p>
        </div>

        <nav className="flex-1 px-3">
          <ul className="space-y-1">
            {NAV.map(({ href, label, Icon, key }) => {
              const active = (section ?? "") === key;
              return (
                <li key={key}>
                  <a
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`text-caption relative flex min-h-11 items-center gap-3 px-3 transition-colors ${
                      active ? "bg-paper/10 text-paper" : "text-paper/70 hover:bg-paper/5 hover:text-paper"
                    }`}
                  >
                    {active && <span className="bg-amber absolute inset-y-2 left-0 w-0.5" aria-hidden="true" />}
                    <Icon />
                    {label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-paper/10 border-t px-6 py-5">
          <p className="text-caption text-paper truncate">{profile.full_name || "Administrator"}</p>
          <p className="text-micro text-paper/60">Administrator</p>
          <button
            type="button"
            onClick={signOut}
            className="text-caption text-paper/70 hover:text-paper mt-4 inline-flex items-center gap-2"
          >
            <IconExit width={16} height={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0">{page}</main>
    </div>
  );
}
