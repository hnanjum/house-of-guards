import { useCallback, useEffect, useState, type ReactNode } from "react";
import PortalShell from "../PortalShell";
import { Notice } from "../ui";
import type { Assignment, ClockEvent, Profile } from "../../../lib/portalSupabase";
import {
  IconBell,
  IconBook,
  IconCalendar,
  IconCalendarPlus,
  IconClock,
  IconDoc,
  IconExit,
  IconFlag,
  IconMessage,
  IconMore,
  IconNote,
  IconOverview,
  IconUser,
} from "../admin/icons";
import { dutyState, loadAssignments, loadClockEvents } from "./data";
import { clearDevice, useOutbox } from "./offline";
import { documentReminders, loadDocuments, loadMessages, loadPolicies } from "./ops";
import Home from "./OfficerHome";
import MyShifts from "./MyShifts";
import ShiftDetail, { type ShiftTab } from "./ShiftDetail";
import Timesheet from "./Timesheet";
import ProfilePage from "./ProfilePage";
import IncidentReport, { MyReports } from "./IncidentReport";
import Panic from "./Panic";
import { Documents, ExtraShifts, Messages, More, OutboxPanel, Payslips, Policies } from "./Staff";
import { useWelfare, WelfareBar } from "./Welfare";

/**
 * Officers portal (officers.harleygarrison.co.uk), laid out like the
 * admin and client dashboards:
 *  - desktop (lg+): the Ink sidebar with every section, and a Panic
 *    control at its foot;
 *  - phones: an Ink top bar with the logo and a Panic button, and a
 *    fixed bottom tab bar (Home / Shifts / Report / Messages / More).
 *    The active tab carries an Amber top mark plus full-strength text,
 *    never colour alone.
 * Screens switch by URL hash so the phone's back button works.
 *
 * Across every screen: a banner when records are saved on the phone
 * waiting for signal (offline mode), and a welfare check-in reminder
 * when one is due.
 */

const NAV = [
  { href: "#/", key: "", label: "Home", Icon: IconOverview },
  { href: "#/shifts", key: "shifts", label: "My shifts", Icon: IconCalendar },
  { href: "#/extra", key: "extra", label: "Extra shifts", Icon: IconCalendarPlus },
  { href: "#/report", key: "report", label: "Report incident", Icon: IconFlag },
  { href: "#/messages", key: "messages", label: "Messages", Icon: IconMessage },
  { href: "#/timesheet", key: "timesheet", label: "Timesheet", Icon: IconClock },
  { href: "#/payslips", key: "payslips", label: "Payslips", Icon: IconNote },
  { href: "#/documents", key: "documents", label: "Documents", Icon: IconDoc },
  { href: "#/policies", key: "policies", label: "Policies and training", Icon: IconBook },
  { href: "#/profile", key: "profile", label: "Profile", Icon: IconUser },
];

const TABS = [
  { href: "#/", key: "", label: "Home", Icon: IconOverview },
  { href: "#/shifts", key: "shifts", label: "Shifts", Icon: IconCalendar },
  { href: "#/report", key: "report", label: "Report", Icon: IconFlag },
  { href: "#/messages", key: "messages", label: "Messages", Icon: IconMessage },
  { href: "#/more", key: "more", label: "More", Icon: IconMore },
];

const MORE_KEYS = new Set(["more", "extra", "reports", "timesheet", "payslips", "documents", "policies", "profile"]);

export default function OfficersApp() {
  return (
    <PortalShell portalName="Officers" tagline="Your shifts, sites and instructions, and clocking in and out." role="guard">
      {({ profile, signOut }) => <Officer profile={profile} signOut={signOut} />}
    </PortalShell>
  );
}

function useRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, "").split("?")[0].split("/");
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

/** Registers the offline service worker (app shell cache) once. */
function useServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || location.hostname === "localhost") return;
    const scope = location.pathname.startsWith("/officers") ? "/officers/" : "/";
    navigator.serviceWorker.register("/officers-sw.js", { scope }).catch(() => {});
  }, []);
}

export function Officer({ profile, signOut }: { profile: Profile; signOut: () => Promise<void> }) {
  const [section, param, tab, sub] = useRoute();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [events, setEvents] = useState<Record<string, ClockEvent[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [reminders, setReminders] = useState<string[]>([]);
  useServiceWorker();

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

  const refreshInbox = useCallback(async () => {
    try {
      const [msgs, docs, policies] = await Promise.all([loadMessages(), loadDocuments(), loadPolicies()]);
      setUnread(msgs.filter((m) => !m.read_at || (m.requires_ack && !m.acknowledged_at)).length);
      const r = documentReminders(docs);
      const todo = policies.filter((p) => p.requires_ack && !p.acked_at).length;
      if (todo) r.push(`${todo} polic${todo === 1 ? "y or training item needs" : "ies or training items need"} your confirmation.`);
      setReminders(r);
    } catch {
      /* keep the last values */
    }
  }, []);

  const outbox = useOutbox(refresh);

  useEffect(() => {
    refresh();
    refreshInbox();
    const onFocus = () => {
      refresh();
      refreshInbox();
    };
    window.addEventListener("focus", onFocus);
    const t = setInterval(refreshInbox, 120_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(t);
    };
  }, [refresh, refreshInbox]);

  // The shift the officer is on now (or can clock in to).
  const accepted = (assignments ?? []).filter((a) => a.status === "accepted");
  const duty =
    accepted.find((a) => dutyState(a, events[a.id]) === "on-duty") ?? accepted.find((a) => dutyState(a, events[a.id]) === "can-clock-in") ?? null;
  const onDuty = duty != null && dutyState(duty, events[duty.id]) === "on-duty";
  const clockedInAt = onDuty ? (events[duty!.id]?.filter((e) => e.type === "in").at(-1)?.server_time ?? null) : null;
  const welfare = useWelfare(onDuty ? duty : null, clockedInAt, profile.id);

  async function safeSignOut() {
    if (outbox.waiting.length && !confirm(`${outbox.waiting.length} record(s) haven't been sent yet. Signing out deletes them from this phone. Sign out anyway?`)) return;
    await clearDevice();
    await signOut();
  }

  const active = section === "shift" ? "shifts" : (section ?? "");
  const firstName = profile.full_name.split(" ")[0] || "officer";

  let page: ReactNode;
  const isId = (s?: string) => !!s && /^[0-9a-f-]{36}$/.test(s);
  if (section === "shift" && isId(param)) {
    const t = (["patrol", "log", "checks", "site"].includes(tab) ? tab : "overview") as ShiftTab;
    page = <ShiftDetail key={param} assignmentId={param} officerId={profile.id} tab={t} sub={isId(sub) ? sub : undefined} initial={assignments?.find((a) => a.id === param) ?? null} onChanged={refresh} />;
  } else if (section === "shifts") {
    page = <MyShifts officerId={profile.id} assignments={assignments} events={events} onChanged={refresh} />;
  } else if (section === "report") {
    page = <IncidentReport officerId={profile.id} assignments={assignments} duty={duty} />;
  } else if (section === "reports") {
    page = <MyReports />;
  } else if (section === "panic") {
    page = <Panic duty={onDuty ? duty : null} />;
  } else if (section === "messages") {
    page = <Messages officerId={profile.id} openId={isId(param) ? param : undefined} onRead={refreshInbox} />;
  } else if (section === "extra") {
    page = <ExtraShifts officerId={profile.id} />;
  } else if (section === "timesheet") {
    page = <Timesheet officerId={profile.id} />;
  } else if (section === "payslips") {
    page = <Payslips />;
  } else if (section === "documents") {
    page = <Documents officerId={profile.id} />;
  } else if (section === "policies") {
    page = <Policies officerId={profile.id} openId={isId(param) ? param : undefined} onChanged={refreshInbox} />;
  } else if (section === "profile") {
    page = <ProfilePage profile={profile} signOut={safeSignOut} />;
  } else if (section === "more") {
    page = <More outbox={outbox} />;
  } else {
    page = (
      <Home
        officerId={profile.id}
        firstName={firstName}
        assignments={assignments}
        events={events}
        onChanged={refresh}
        duty={duty}
        onDuty={onDuty}
        reminders={reminders}
        unread={unread}
        outbox={<OutboxPanel outbox={outbox} />}
      />
    );
  }

  const tabActive = MORE_KEYS.has(active) ? "more" : active === "shifts" || active === "extra" ? "shifts" : active;

  return (
    <div className="bg-surface-alt min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* Phone top bar */}
      <div className="on-dark bg-ink text-paper sticky top-0 z-30 flex items-center justify-between gap-3 px-gutter py-2.5 lg:hidden">
        <img src="/logo/logo-white.svg" alt="Harley Garrison" width="118" height="32" className="h-8 w-auto" />
        <a href="#/panic" className="text-caption bg-magenta text-paper inline-flex min-h-11 items-center gap-2 px-4">
          <IconBell width={18} height={18} />
          Panic
        </a>
      </div>

      {/* Desktop sidebar */}
      <aside className="on-dark bg-ink text-paper sticky top-0 hidden h-dvh flex-col overflow-y-auto lg:flex" aria-label="Officer navigation">
        <div className="px-6 pt-7 pb-6">
          <img src="/logo/logo-white.svg" alt="Harley Garrison" width="148" height="40" className="h-9 w-auto" />
          <p className="text-micro text-paper/60 mt-3">Officers</p>
        </div>
        <nav className="flex-1 px-3">
          <ul className="space-y-1">
            {NAV.map(({ href, key, label, Icon }) => {
              const on = active === key || (key === "report" && active === "reports");
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
                    <span className="flex-1">{label}</span>
                    {key === "messages" && unread > 0 && (
                      <span className="text-micro bg-paper text-ink min-w-5 px-1.5 text-center tabular-nums">
                        {unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="px-6 pt-4">
          <a href="#/panic" className="text-caption bg-magenta text-paper flex min-h-12 items-center justify-center gap-2">
            <IconBell width={18} height={18} />
            Panic alert
          </a>
        </div>
        <div className="border-paper/10 mt-5 border-t px-6 py-5">
          <p className="text-caption text-paper truncate">{profile.full_name || "Officer"}</p>
          <p className="text-micro text-paper/60">Security officer</p>
          <button type="button" onClick={safeSignOut} className="text-caption text-paper/70 hover:text-paper mt-4 inline-flex items-center gap-2">
            <IconExit width={16} height={16} />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 pb-24 lg:pb-0">
        {!outbox.online && (
          <div className="bg-ink text-paper on-dark px-gutter py-2.5 md:px-10" role="status">
            <p className="text-caption">No signal. You can keep working — records are saved on this phone and sent automatically.</p>
          </div>
        )}
        {outbox.online && outbox.waiting.length > 0 && (
          <div className="border-hairline bg-paper border-b px-gutter py-2.5 md:px-10" role="status">
            <p className="text-caption text-ink">Sending {outbox.waiting.length} saved record{outbox.waiting.length === 1 ? "" : "s"}…</p>
          </div>
        )}
        {outbox.failed.length > 0 && section !== "more" && (
          <div className="px-gutter pt-6 md:px-10">
            <Notice kind="error">
              {outbox.failed.length} saved record{outbox.failed.length === 1 ? " was" : "s were"} refused by the server.{" "}
              <a href="#/more" className="underline underline-offset-4">
                See details
              </a>
            </Notice>
          </div>
        )}
        <WelfareBar w={welfare} />
        {error && (
          <div className="px-gutter pt-6 md:px-10">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        {page}
      </main>

      {/* Phone bottom tab bar */}
      <nav aria-label="Officer navigation" className="border-hairline bg-paper fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map(({ href, key, label, Icon }) => {
            const on = tabActive === key || (key === "report" && active === "reports");
            return (
              <li key={key}>
                <a
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={`text-micro relative flex min-h-16 flex-col items-center justify-center gap-1 ${on ? "text-ink" : "text-stone"}`}
                >
                  {on && <span className="bg-amber absolute inset-x-4 top-0 h-0.5" aria-hidden="true" />}
                  <span className="relative">
                    <Icon width={22} height={22} />
                    {key === "messages" && unread > 0 && <span className="bg-electric-blue absolute -top-0.5 -right-1 size-2" aria-hidden="true" />}
                  </span>
                  {label}
                  {key === "messages" && unread > 0 && <span className="sr-only">, {unread} unread</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
