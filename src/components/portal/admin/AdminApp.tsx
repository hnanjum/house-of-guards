import { useEffect, useRef, useState, type ReactNode } from "react";
import PortalShell from "../PortalShell";
import type { Profile } from "../../../lib/portalSupabase";
import {
  IconBell,
  IconBook,
  IconBuilding,
  IconCalendar,
  IconClipboard,
  IconClock,
  IconDoc,
  IconExit,
  IconFlag,
  IconMenu,
  IconMessage,
  IconNote,
  IconOverview,
  IconPeople,
  IconPin,
  IconUser,
} from "./icons";
import Dashboard from "./Dashboard";
import ControlRoom from "./ControlRoom";
import Rota from "./Rota";
import Attendance from "./Attendance";
import Timesheets from "./Timesheets";
import Incidents from "./Incidents";
import SiteLogs from "./SiteLogs";
import ClientReports from "./ClientReports";
import Guards from "./Guards";
import ComplianceOverview from "./ComplianceOverview";
import Sites from "./Sites";
import Clients from "./Clients";
import AdminMessages from "./AdminMessages";
import AdminPolicies from "./AdminPolicies";
import Users from "./Users";
import AuditLog from "./AuditLog";
import { ClientPortal } from "../client/ClientApp";
import { ALERT_LABEL, subscribeControl } from "./opsData";
import { ThemeToggle } from "../theme";

/**
 * Admin dashboard (admin.harleygarrison.co.uk).
 *
 * LAYOUT — a fixed left sidebar on desktop (Ink, white logo, grouped
 * icon + label nav, theme toggle, the signed-in person and sign-out),
 * and a collapsible slide-in menu below `lg` (tablets and phones) behind
 * the top bar's menu button. Content scrolls under a sticky page header.
 *
 * LIVE ALERTS — on every page the dashboard listens (Supabase Realtime)
 * for new alerts, serious incidents and client requests: a banner
 * appears, a short tone plays and, if allowed, a browser notification
 * is shown. This only works while a dashboard is open; someone must be
 * watching for alerts to reach a person.
 *
 * COLOUR — sidebar Ink with Paper text (~19.4:1) and `on-dark` focus
 * rings; the active item has an Amber bar (bare mark on Ink, ~9.05:1)
 * plus a lighter row and full-strength text. Panic alerts use Magenta.
 */

const NAV: { group: string; items: { href: string; label: string; Icon: (p: { width?: number; height?: number }) => ReactNode; key: string }[] }[] = [
  {
    group: "Operations",
    items: [
      { href: "#/", label: "Dashboard", Icon: IconOverview, key: "" },
      { href: "#/control", label: "Control room", Icon: IconBell, key: "control" },
      { href: "#/rota", label: "Rota", Icon: IconCalendar, key: "rota" },
      { href: "#/attendance", label: "Attendance", Icon: IconClock, key: "attendance" },
      { href: "#/incidents", label: "Incidents", Icon: IconFlag, key: "incidents" },
      { href: "#/logs", label: "Site logs", Icon: IconBook, key: "logs" },
    ],
  },
  {
    group: "People",
    items: [
      { href: "#/officers", label: "Officers", Icon: IconPeople, key: "officers" },
      { href: "#/compliance", label: "Compliance", Icon: IconDoc, key: "compliance" },
      { href: "#/timesheets", label: "Timesheets", Icon: IconNote, key: "timesheets" },
      { href: "#/messages", label: "Messages", Icon: IconMessage, key: "messages" },
      { href: "#/policies", label: "Policies", Icon: IconClipboard, key: "policies" },
    ],
  },
  {
    group: "Clients",
    items: [
      { href: "#/sites", label: "Sites", Icon: IconPin, key: "sites" },
      { href: "#/clients", label: "Clients", Icon: IconBuilding, key: "clients" },
      { href: "#/reports", label: "Client reports", Icon: IconBook, key: "reports" },
    ],
  },
  {
    group: "Admin",
    items: [
      { href: "#/users", label: "Users and roles", Icon: IconUser, key: "users" },
      { href: "#/audit", label: "Audit log", Icon: IconDoc, key: "audit" },
    ],
  },
];

export default function AdminApp() {
  return (
    <PortalShell portalName="Admin" tagline="Control room, rota, officers, sites and client reporting in one place." role="admin">
      {({ profile, signOut }) => <Dashboard_ profile={profile} signOut={signOut} />}
    </PortalShell>
  );
}

function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => setParts(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

/** A short two-note tone via Web Audio (no sound file needed). */
function chime(urgent: boolean) {
  try {
    const ctx = new AudioContext();
    const notes = urgent ? [880, 660, 880, 660] : [660, 880];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.22 + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.22);
      o.stop(ctx.currentTime + i * 0.22 + 0.21);
    });
  } catch {
    /* audio blocked until the page has been clicked once */
  }
}

interface Live {
  id: string;
  text: string;
  href: string;
  urgent: boolean;
}

function Dashboard_({ profile, signOut }: { profile: Profile; signOut: () => Promise<void> }) {
  const [section, param, sub] = useRoute();
  const [drawer, setDrawer] = useState(false);
  const [live, setLive] = useState<Live[]>([]);
  const [tick, setTick] = useState(0);
  const [notify, setNotify] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const seen = useRef(new Set<string>());

  useEffect(() => setDrawer(false), [section, param, sub]);

  useEffect(
    () =>
      subscribeControl((table, row, event) => {
        setTick((t) => t + 1);
        if (event !== "INSERT" || !row?.id || seen.current.has(row.id)) return;
        seen.current.add(row.id);
        let item: Live;
        if (table === "alerts") {
          const kind = row.kind as keyof typeof ALERT_LABEL;
          item = { id: row.id, text: `${ALERT_LABEL[kind] ?? "Alert"}${row.details ? ` — ${row.details}` : ""}`, href: "#/control", urgent: kind === "panic" };
        } else if (table === "incidents") {
          item = { id: row.id, text: `New incident report: ${row.title}`, href: `#/incidents/${row.id}`, urgent: row.severity === "critical" };
        } else {
          item = { id: row.id, text: "New request from a client", href: "#/control", urgent: false };
        }
        setLive((l) => [item, ...l].slice(0, 5));
        chime(item.urgent);
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(item.urgent ? "PANIC ALERT" : "Harley Garrison control", { body: item.text, tag: item.id, requireInteraction: item.urgent });
          }
        } catch {
          /* notifications unavailable */
        }
      }),
    [],
  );

  let page: ReactNode;
  switch (section) {
    case "control":
      page = <ControlRoom profile={profile} tick={tick} />;
      break;
    case "rota":
    case "shifts":
      page = <Rota profile={profile} />;
      break;
    case "attendance":
      page = <Attendance />;
      break;
    case "timesheets":
      page = <Timesheets profile={profile} />;
      break;
    case "incidents":
      page = <Incidents profile={profile} selectedId={param} tick={tick} />;
      break;
    case "logs":
      page = <SiteLogs />;
      break;
    case "reports":
      page = <ClientReports profile={profile} tab={param} />;
      break;
    case "officers":
      page = <Guards profile={profile} selectedId={param} tab={sub} />;
      break;
    case "compliance":
    case "documents":
      page = <ComplianceOverview profile={profile} />;
      break;
    case "sites":
      page = <Sites selectedId={param} sub={sub} />;
      break;
    case "clients":
      page = <Clients />;
      break;
    case "messages":
      page = <AdminMessages profile={profile} />;
      break;
    case "policies":
      page = <AdminPolicies />;
      break;
    case "users":
      page = <Users profile={profile} />;
      break;
    case "audit":
      page = <AuditLog />;
      break;
    case "preview":
      page = param ? (
        <div>
          <div className="on-dark bg-ink text-paper flex flex-wrap items-center justify-between gap-3 px-gutter py-3 md:px-10">
            <p className="text-caption">Preview — exactly what this client sees. Nothing here can be changed or sent.</p>
            <a href="#/clients" className="text-caption underline underline-offset-4">
              Back to clients
            </a>
          </div>
          <ClientPortal clientId={param} hrefBase={`#/preview/${param}/`} preview />
        </div>
      ) : null;
      break;
    default:
      page = <Dashboard tick={tick} />;
  }

  const activeKey = section === "shifts" ? "rota" : section === "documents" ? "compliance" : section === "preview" ? "clients" : (section ?? "");

  return (
    <div className="bg-surface-alt min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Top bar (tablets and phones) */}
      <div className="on-dark bg-ink text-paper sticky top-0 z-30 flex items-center justify-between gap-3 px-gutter py-3 lg:hidden">
        <img src="/logo/logo-white.svg" alt="Harley Garrison" width="118" height="32" className="h-8 w-auto" />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={drawer} className="inline-flex size-11 items-center justify-center">
            <IconMenu />
          </button>
        </div>
      </div>

      {drawer && <div className="on-dark bg-ink/50 fixed inset-0 z-40 lg:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <aside
        className={`on-dark bg-ink text-paper fixed inset-y-0 left-0 z-50 flex w-64 flex-col overflow-y-auto transition-transform duration-300 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 ${
          drawer ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Admin navigation"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-7 pb-6">
          <div>
            <img src="/logo/logo-white.svg" alt="Harley Garrison" width="148" height="40" className="h-9 w-auto" />
            <p className="text-micro text-paper/60 mt-3">Operations</p>
          </div>
          <span className="hidden lg:block">
            <ThemeToggle />
          </span>
        </div>

        <nav className="flex-1 px-3">
          {NAV.map((g) => (
            <div key={g.group} className="mb-5">
              <p className="text-micro text-paper/50 px-3 pb-1">{g.group}</p>
              <ul className="space-y-0.5">
                {g.items.map(({ href, label, Icon, key }) => {
                  const active = activeKey === key;
                  return (
                    <li key={key}>
                      <a
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={`text-caption relative flex min-h-10 items-center gap-3 px-3 transition-colors ${
                          active ? "bg-paper/10 text-paper" : "text-paper/70 hover:bg-paper/5 hover:text-paper"
                        }`}
                      >
                        {active && <span className="bg-amber absolute inset-y-2 left-0 w-0.5" aria-hidden="true" />}
                        <Icon width={18} height={18} />
                        {label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-paper/10 border-t px-6 py-5">
          {notify === "default" && (
            <button type="button" onClick={async () => setNotify(await Notification.requestPermission())} className="text-caption text-paper/80 hover:text-paper mb-4 block text-left underline underline-offset-4">
              Turn on alert notifications
            </button>
          )}
          <p className="text-caption text-paper truncate">{profile.full_name || "Administrator"}</p>
          <p className="text-micro text-paper/60">Administrator</p>
          <button type="button" onClick={signOut} className="text-caption text-paper/70 hover:text-paper mt-4 inline-flex items-center gap-2">
            <IconExit width={16} height={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0">
        {live.length > 0 && (
          <div className="sticky top-0 z-40 max-lg:top-14" role="alert">
            {live.map((l) => (
              <div key={l.id} className={`flex flex-wrap items-center justify-between gap-3 px-gutter py-3 md:px-10 ${l.urgent ? "on-dark bg-magenta text-paper" : "bg-amber text-ink"}`}>
                <a href={l.href} className="text-caption underline-offset-4 hover:underline" onClick={() => setLive((x) => x.filter((y) => y.id !== l.id))}>
                  {l.text}
                </a>
                <button type="button" className="text-caption underline underline-offset-4" onClick={() => setLive((x) => x.filter((y) => y.id !== l.id))}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}
        {page}
      </main>
    </div>
  );
}
