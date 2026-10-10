import { useCallback, useEffect, useState } from "react";
import type { Assignment } from "../../../lib/portalSupabase";
import { fmtShortDay, fmtTime, Loading, Notice, PortalButton } from "../ui";
import { Empty, Panel, Status } from "../admin/kit";
import type { Position } from "./data";
import { endPatrol, loadCheckpoints, loadPatrols, scanCheckpoint, startPatrol, type Checkpoint, type PatrolRow } from "./ops";
import { QrScanner } from "./widgets";

/**
 * Patrol rounds. The officer starts a patrol, scans each checkpoint's QR
 * sticker in order, and ends it. The server decides whether a scan was
 * the next checkpoint expected, timestamps it, and raises an alert for
 * control if a patrol ends with checkpoints missed (or if no patrol is
 * started within the site's patrol interval).
 */

function lastKnownPosition(): Promise<Position | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 4_000, maximumAge: 60_000 },
    );
  });
}

export default function Patrol({ a, onDuty }: { a: Assignment; onDuty: boolean }) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[] | null>(null);
  const [patrols, setPatrols] = useState<PatrolRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([loadCheckpoints(a.id), loadPatrols(a.id)]);
      setCheckpoints(c);
      setPatrols(p);
      setError(null);
    } catch {
      setError("Patrol details couldn't be loaded. Check your connection.");
    }
  }, [a.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!checkpoints || !patrols) return <Loading label="Loading patrol" />;

  const current = patrols.find((p) => !p.ended_at);
  const interval = a.shift.site.patrol_interval_min;

  if (checkpoints.length === 0) {
    return (
      <Panel>
        <p className="text-caption text-ink">No patrol checkpoints have been set up for this site.</p>
        <p className="text-caption text-stone mt-1">If there should be, let the office know.</p>
      </Panel>
    );
  }

  async function begin() {
    setBusy(true);
    setResult(null);
    try {
      await startPatrol(a.id, a.shift.site.name);
      await load();
    } catch {
      setResult({ kind: "error", text: "The patrol couldn't be started. Try again." });
    }
    setBusy(false);
  }

  async function onCode(code: string) {
    if (!current || busy) return;
    setBusy(true);
    try {
      const pos = await lastKnownPosition();
      const r = await scanCheckpoint(current.id, code, pos);
      if (!r) {
        setResult({ kind: "info", text: "Scan saved on this phone. It will be checked against the route when you have signal." });
      } else if (r.repeat) {
        setResult({ kind: "info", text: `${r.checkpoint_name} was already scanned on this patrol.` });
      } else if (r.in_order) {
        setResult({ kind: "info", text: `${r.checkpoint_name} recorded (${r.scanned} of ${r.total}).${r.scanned === r.total ? " All checkpoints done — end the patrol." : ""}` });
      } else {
        setResult({ kind: "info", text: `${r.checkpoint_name} recorded out of order. The next checkpoint was ${r.expected_name ?? "a different one"}.` });
      }
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setResult({ kind: "error", text: /not a checkpoint/i.test(msg) ? "That code isn't a checkpoint at this site." : "That scan didn't go through. Try again." });
    }
    setBusy(false);
  }

  async function finish() {
    if (!current) return;
    const done = new Set(current.scans.map((s) => s.checkpoint_id));
    const missed = checkpoints!.filter((c) => !done.has(c.id)).length;
    const pending = current.scans.some((s) => s.pending);
    if (missed > 0 && !pending && !confirm(`${missed} checkpoint${missed === 1 ? " hasn't" : "s haven't"} been scanned. End the patrol anyway? Control will be told.`)) return;
    setBusy(true);
    try {
      await endPatrol(current.id);
      setResult({ kind: "info", text: "Patrol ended." });
      await load();
    } catch {
      setResult({ kind: "error", text: "The patrol couldn't be ended. Try again." });
    }
    setBusy(false);
  }

  const lastStart = patrols[0]?.started_at;
  const nextDue = interval && lastStart ? Date.parse(lastStart) + interval * 60_000 : null;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-8">
        {current ? (
          <Panel title={`Patrol started ${fmtTime(current.started_at)}`}>
            <QrScanner onCode={onCode} busy={busy} />
            <div className="mt-6 space-y-4" aria-live="polite">
              {result && <Notice kind={result.kind}>{result.text}</Notice>}
              <PortalButton tone="quiet" disabled={busy} onClick={finish}>
                End patrol
              </PortalButton>
            </div>
          </Panel>
        ) : (
          <Panel title="Patrol">
            <p className="text-caption text-ink">
              {checkpoints.length} checkpoint{checkpoints.length === 1 ? "" : "s"} on this route.
              {interval ? ` A patrol is expected every ${interval} minutes.` : ""}
            </p>
            {nextDue && <p className="text-caption text-stone mt-1">Next patrol due {Date.now() > nextDue ? "now" : `at ${fmtTime(new Date(nextDue).toISOString())}`}.</p>}
            {onDuty ? (
              <PortalButton className="mt-5 w-full sm:w-auto sm:min-w-64" disabled={busy} onClick={begin}>
                {busy ? "Starting" : "Start patrol"}
              </PortalButton>
            ) : (
              <p className="text-caption text-stone mt-5">Clock in to start a patrol.</p>
            )}
            {result && (
              <div className="mt-4">
                <Notice kind={result.kind}>{result.text}</Notice>
              </div>
            )}
          </Panel>
        )}

        <Panel title="Route" flush>
          <ol className="divide-hairline divide-y">
            {checkpoints.map((c, i) => {
              const scan = current?.scans.find((s) => s.checkpoint_id === c.id);
              return (
                <li key={c.id} className="flex items-center gap-4 px-6 py-3">
                  <span className="text-caption text-stone w-6 shrink-0 tabular-nums">{i + 1}</span>
                  <span className="text-caption text-ink min-w-0 flex-1">{c.name}</span>
                  {current &&
                    (scan ? (
                      <Status tone={scan.in_order === false ? "warn" : "good"}>
                        {fmtTime(scan.scanned_at)}
                        {scan.in_order === false ? " · out of order" : ""}
                      </Status>
                    ) : (
                      <Status tone="idle">Not yet</Status>
                    ))}
                </li>
              );
            })}
          </ol>
          {current && current.scans.some((s) => s.pending) && (
            <p className="text-micro text-stone px-6 pb-4">{current.scans.filter((s) => s.pending).length} scan(s) waiting for signal.</p>
          )}
        </Panel>
      </div>

      <Panel title="Patrols this shift" flush>
        {patrols.length === 0 ? (
          <Empty>No patrols yet.</Empty>
        ) : (
          <ul className="divide-hairline divide-y">
            {patrols.map((p) => {
              const missed = p.checkpoints_missed;
              return (
                <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-6 py-4">
                  <span className="text-caption text-ink tabular-nums">
                    {fmtShortDay(p.started_at)} {fmtTime(p.started_at)}
                    {p.ended_at ? ` – ${fmtTime(p.ended_at)}` : ""}
                  </span>
                  {p.pending ? (
                    <Status tone="idle">Waiting for signal</Status>
                  ) : !p.ended_at ? (
                    <Status tone="good">In progress · {p.scans.length} scanned</Status>
                  ) : missed ? (
                    <Status tone="bad">{missed} missed</Status>
                  ) : (
                    <Status tone="good">All {p.checkpoints_total ?? p.scans.length} done</Status>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
