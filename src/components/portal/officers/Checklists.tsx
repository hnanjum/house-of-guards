import { useCallback, useEffect, useState } from "react";
import type { Assignment } from "../../../lib/portalSupabase";
import { fmtTime, Loading, Notice, PortalButton, TextArea } from "../ui";
import { Panel, Status } from "../admin/kit";
import { loadChecklists, loadSubmissions, submitChecklist, type Checklist, type ChecklistResult, type Submission } from "./ops";

/**
 * Equipment checks (radio, torch, body-worn camera…) and site checks
 * (opening up, locking up, fire alarm test). Each item is answered OK or
 * Problem; a problem asks for a short note. The office sees every
 * submission and the number of problems.
 */

const PROMPT: Record<Checklist["prompt_at"], string> = { clock_in: "At clock-in", clock_out: "Before clock-out", any: "During the shift" };

export default function Checklists({ a, officerId, openId }: { a: Assignment; officerId: string; openId?: string }) {
  const [lists, setLists] = useState<Checklist[] | null>(null);
  const [done, setDone] = useState<Submission[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([loadChecklists(a.shift.site.id), loadSubmissions(a.id)]);
      setLists(l);
      setDone(s);
    } catch {
      setError("Checklists couldn't be loaded.");
    }
  }, [a.id, a.shift.site.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!lists) return <Loading />;
  if (lists.length === 0) return <Panel><p className="text-caption text-stone">There are no checklists for this site.</p></Panel>;

  const open = lists.find((l) => l.id === openId);
  if (open) return <Fill a={a} officerId={officerId} list={open} onDone={load} />;

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      {(["equipment", "site"] as const).map((kind) => {
        const ofKind = lists.filter((l) => l.kind === kind);
        if (!ofKind.length) return null;
        return (
          <Panel key={kind} title={kind === "equipment" ? "Equipment" : "Site checks"} flush>
            <ul className="divide-hairline divide-y">
              {ofKind.map((l) => {
                const last = done.find((d) => d.checklist_id === l.id);
                return (
                  <li key={l.id}>
                    <a href={`#/shift/${a.id}/checks/${l.id}`} className="hover:bg-surface-alt flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                      <span className="min-w-0">
                        <span className="text-caption text-ink block">{l.name}</span>
                        <span className="text-micro text-stone block">
                          {l.items.length} items · {PROMPT[l.prompt_at]}
                        </span>
                      </span>
                      {last ? (
                        <Status tone={last.issues ? "warn" : "good"}>
                          {last.pending ? "Waiting for signal" : `Done ${fmtTime(last.completed_at)}`}
                          {last.issues ? ` · ${last.issues} problem${last.issues === 1 ? "" : "s"}` : ""}
                        </Status>
                      ) : (
                        <Status tone="idle">Not done</Status>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function Fill({ a, officerId, list, onDone }: { a: Assignment; officerId: string; list: Checklist; onDone: () => Promise<void> }) {
  const [answers, setAnswers] = useState<Record<number, { ok: boolean | null; note: string }>>({});
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const set = (i: number, v: Partial<{ ok: boolean | null; note: string }>) =>
    setAnswers((prev) => ({ ...prev, [i]: { ok: prev[i]?.ok ?? null, note: prev[i]?.note ?? "", ...v } }));

  async function submit() {
    const missing = list.items.findIndex((_, i) => answers[i]?.ok == null);
    if (missing >= 0) {
      setError(`Answer every item. "${list.items[missing]}" hasn't been answered.`);
      document.getElementById(`item-${missing}`)?.focus();
      return;
    }
    const unexplained = list.items.findIndex((_, i) => answers[i]?.ok === false && !answers[i]?.note.trim());
    if (unexplained >= 0) {
      setError(`Say what the problem is with "${list.items[unexplained]}".`);
      document.getElementById(`note-${unexplained}`)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const results: ChecklistResult[] = list.items.map((item, i) => ({ item, ok: answers[i].ok === true, ...(answers[i].note.trim() ? { note: answers[i].note.trim() } : {}) }));
      const res = await submitChecklist(officerId, { assignment_id: a.id, site_id: a.shift.site.id }, list, results, notes);
      await onDone();
      setSaved(res.queued ? "Saved on this phone. It will be sent when you have signal." : "Checklist sent to the office.");
    } catch {
      setError("The checklist couldn't be sent. Try again.");
    }
    setBusy(false);
  }

  const back = (
    <a href={`#/shift/${a.id}/checks`} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
      All checklists
    </a>
  );

  if (saved) {
    return (
      <Panel title={list.name}>
        <Notice>{saved}</Notice>
        <div className="mt-6">{back}</div>
      </Panel>
    );
  }

  return (
    <Panel title={list.name} action={back} flush>
      <ol className="divide-hairline divide-y">
        {list.items.map((item, i) => {
          const v = answers[i];
          const choice = (ok: boolean) =>
            `text-caption min-h-11 min-w-24 border px-4 ${v?.ok === ok ? "border-ink bg-ink text-paper" : "border-ink/20 text-ink hover:border-ink"}`;
          return (
            <li key={i} className="px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p id={`label-${i}`} className="text-caption text-ink min-w-0 flex-1">
                  {item}
                </p>
                <div className="flex gap-2" role="group" aria-labelledby={`label-${i}`}>
                  <button id={`item-${i}`} type="button" aria-pressed={v?.ok === true} className={choice(true)} onClick={() => set(i, { ok: true })}>
                    OK
                  </button>
                  <button type="button" aria-pressed={v?.ok === false} className={choice(false)} onClick={() => set(i, { ok: false })}>
                    Problem
                  </button>
                </div>
              </div>
              {v?.ok === false && (
                <div className="mt-3">
                  <TextArea label="What's wrong?" id={`note-${i}`} rows={2} value={v.note} onChange={(e) => set(i, { note: e.target.value })} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div className="border-hairline space-y-4 border-t p-6">
        <TextArea label="Anything else (optional)" id="list-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {error && <Notice kind="error">{error}</Notice>}
        <PortalButton disabled={busy} onClick={submit}>
          {busy ? "Sending" : "Submit checklist"}
        </PortalButton>
      </div>
    </Panel>
  );
}
