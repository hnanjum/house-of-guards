import { useCallback, useEffect, useRef, useState } from "react";
import type { Assignment } from "../../../lib/portalSupabase";
import { fmtTime, Notice, PortalButton } from "../ui";
import { Panel } from "../admin/kit";
import { quickPosition } from "./data";
import { lastWelfareCheck, welfareCheckIn } from "./ops";

/**
 * Lone-worker welfare check-ins. Sites with a check-in interval expect
 * the officer to tap "I'm OK" at least that often while on duty.
 *
 * On the phone: a countdown, a reminder banner on every screen when it's
 * due, a vibration and (if allowed) a notification.
 *
 * The real safety net is on the server: a job runs every minute and
 * raises an alert in the control room if a check-in is more than five
 * minutes overdue — it works even if the phone is off, flat or out of
 * signal, which is exactly when it matters. A phone can put a web page
 * to sleep when the screen is locked, so reminders on the phone are a
 * convenience, not the guarantee.
 */

/** `clockedInAt` is the clock-in time while on duty, otherwise null. */
export function useWelfare(a: Assignment | null, clockedInAt: string | null, officerId: string) {
  const interval = a?.shift.site.welfare_interval_min ?? null;
  const active = clockedInAt != null;
  const [last, setLast] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const alerted = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!a || !interval || !active) return;
    setLast(await lastWelfareCheck(a.id));
  }, [a, interval, active]);

  useEffect(() => {
    refresh();
    // Another copy of this hook (panel vs. banner) checked in.
    const on = (e: Event) => setLast((e as CustomEvent<string>).detail);
    window.addEventListener("hg-welfare", on);
    return () => window.removeEventListener("hg-welfare", on);
  }, [refresh]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [active]);

  // The clock-in time anchors the first check-in.
  const anchor = last && clockedInAt && last > clockedInAt ? last : clockedInAt;
  const dueAt = interval && anchor ? Date.parse(anchor) + interval * 60_000 : null;
  const due = dueAt != null && now >= dueAt;
  const soon = dueAt != null && !due && dueAt - now < 5 * 60_000;

  useEffect(() => {
    if (!due || !dueAt || alerted.current === String(dueAt)) return;
    alerted.current = String(dueAt);
    navigator.vibrate?.([300, 150, 300]);
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Welfare check-in due", { body: "Tap to confirm you're OK.", tag: "hg-welfare" });
      }
    } catch {
      /* some browsers only allow notifications from a service worker */
    }
  }, [due, dueAt]);

  async function checkIn() {
    if (!a) return;
    setBusy(true);
    setMessage(null);
    try {
      const pos = await quickPosition();
      const res = await welfareCheckIn(a.id, officerId, pos, a.shift.site.name);
      const at = new Date().toISOString();
      setLast(at);
      window.dispatchEvent(new CustomEvent("hg-welfare", { detail: at }));
      setMessage(res.queued ? `Checked in at ${fmtTime(at)}. No signal, so it will be sent when you have one.` : `Checked in at ${fmtTime(at)}.`);
    } catch {
      setMessage("That didn't go through. Try again.");
    }
    setBusy(false);
  }

  return { enabled: Boolean(interval && active), interval, last, dueAt, due, soon, busy, message, checkIn };
}

export function WelfarePanel({ a, officerId, clockedInAt }: { a: Assignment; officerId: string; clockedInAt: string }) {
  const w = useWelfare(a, clockedInAt, officerId);
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  if (!w.enabled) return null;
  const mins = w.dueAt ? Math.round((w.dueAt - Date.now()) / 60_000) : null;
  return (
    <Panel title="Welfare check-in">
      <p className="text-caption text-ink">
        Every {w.interval} minutes.{" "}
        {w.last ? `Last check-in ${fmtTime(w.last)}.` : "Check in now to start the timer."}
      </p>
      {w.dueAt && (
        <p className="text-h3 text-ink mt-3 tabular-nums">
          {w.due ? "Due now" : mins! <= 1 ? "Due in under a minute" : `Next due in ${mins} min`}
        </p>
      )}
      <PortalButton className="mt-5 w-full sm:w-auto sm:min-w-64" disabled={w.busy} onClick={w.checkIn}>
        {w.busy ? "Checking in" : "I'm OK — check in"}
      </PortalButton>
      {w.message && (
        <div className="mt-4">
          <Notice>{w.message}</Notice>
        </div>
      )}
      {perm === "default" && (
        <button
          type="button"
          onClick={async () => setPerm(await Notification.requestPermission())}
          className="text-caption text-ink mt-4 block underline decoration-hairline underline-offset-4 hover:decoration-ink"
        >
          Turn on reminder notifications
        </button>
      )}
      <p className="text-micro text-stone mt-4">If a check-in is missed, control is alerted automatically, even if your phone is off.</p>
    </Panel>
  );
}

/** Thin banner shown on every screen when a check-in is due or close. */
export function WelfareBar({ w }: { w: ReturnType<typeof useWelfare> }) {
  if (!w.enabled || (!w.due && !w.soon)) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-gutter py-3 md:px-10 ${w.due ? "bg-amber text-ink" : "bg-paper text-ink border-hairline border-b"}`} role={w.due ? "alert" : "status"}>
      <p className="text-caption">{w.due ? "Welfare check-in due now." : "Welfare check-in due in a few minutes."}</p>
      <button type="button" onClick={w.checkIn} disabled={w.busy} className="text-caption bg-ink text-paper min-h-11 px-5 disabled:opacity-50">
        {w.busy ? "Checking in" : "I'm OK"}
      </button>
    </div>
  );
}
