import { useEffect, useState } from "react";
import type { Assignment } from "../../../lib/portalSupabase";
import { fmtTime, Notice } from "../ui";
import { Page, PageHeader, Panel } from "../admin/kit";
import { quickPosition } from "./data";
import { loadAlert, raisePanic, type MyAlert } from "./ops";
import { HoldButton } from "./widgets";

/**
 * Panic alert. Hold the button for two seconds: the alert goes to the
 * control room straight away (with location if the phone can get one in
 * a few seconds — it never waits longer), and this screen then shows
 * when control has seen it.
 *
 * This is NOT a replacement for 999, and the screen says so first. If
 * there's no signal the alert is saved and sent the moment the phone
 * reconnects, but in that case only a phone call can get help.
 */
export default function Panic({ duty }: { duty: Assignment | null }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "queued" | "error">("idle");
  const [alertId, setAlertId] = useState<string | null>(null);
  const [alert, setAlert] = useState<MyAlert | null>(null);

  useEffect(() => {
    if (!alertId || state !== "sent") return;
    const poll = () => loadAlert(alertId).then((a) => a && setAlert(a)).catch(() => {});
    poll();
    const t = setInterval(poll, 5_000);
    return () => clearInterval(t);
  }, [alertId, state]);

  async function fire() {
    setState("sending");
    try {
      const position = await Promise.race([quickPosition(), new Promise<null>((r) => setTimeout(() => r(null), 4_000))]);
      const res = await raisePanic(duty?.id ?? null, position, null);
      setAlertId(res.id);
      setState(res.queued ? "queued" : "sent");
    } catch {
      setState("error");
    }
  }

  return (
    <>
      <PageHeader offset={false} title="Panic alert" />
      <Page>
        <Panel>
          <p className="text-h4 text-ink">If you or anyone else is in immediate danger, call 999.</p>
          <a href="tel:999" className="text-caption bg-ink text-paper mt-4 inline-flex min-h-12 items-center px-6">
            Call 999
          </a>
        </Panel>

        <Panel title="Alert control">
          {state === "idle" || state === "sending" ? (
            <div className="flex flex-col items-center gap-5 py-4">
              <HoldButton onFire={fire} disabled={state === "sending"}>
                <span className="text-h3">{state === "sending" ? "Sending" : "Hold"}</span>
                <span className="text-caption mt-1">{state === "sending" ? "Please wait" : "for 2 seconds"}</span>
              </HoldButton>
              <p className="text-caption text-ink max-w-sm text-center">
                Sends an emergency alert to the control room with your location{duty ? ` and site (${duty.shift.site.name})` : ""}.
              </p>
            </div>
          ) : state === "sent" ? (
            <div className="space-y-4" aria-live="assertive">
              <Notice>Panic alert sent at {fmtTime(new Date().toISOString())}.</Notice>
              <p className="text-h4 text-ink">
                {alert?.resolved_at
                  ? `Closed by control${alert.resolution ? `: ${alert.resolution}` : "."}`
                  : alert?.acknowledged_at
                    ? `Control saw your alert at ${fmtTime(alert.acknowledged_at)}.`
                    : "Waiting for control to respond…"}
              </p>
              <p className="text-caption text-stone">Stay safe. If you can, call 999 or the office.</p>
            </div>
          ) : state === "queued" ? (
            <div className="space-y-4" role="alert">
              <Notice kind="error">No signal — the alert has NOT reached control yet. It will be sent the moment your phone reconnects.</Notice>
              <p className="text-h4 text-ink">Call 999 now if you need help.</p>
            </div>
          ) : (
            <div className="space-y-4" role="alert">
              <Notice kind="error">The alert couldn't be sent. Call 999 or the office.</Notice>
              <button type="button" className="text-caption text-ink underline underline-offset-4" onClick={() => setState("idle")}>
                Try again
              </button>
            </div>
          )}
        </Panel>
      </Page>
    </>
  );
}
