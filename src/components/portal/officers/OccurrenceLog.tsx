import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import type { Assignment } from "../../../lib/portalSupabase";
import { Field, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { Empty, Panel, Status } from "../admin/kit";
import { addLogEntry, LOG_KIND_LABEL, loadKeyMovements, loadKeys, loadLog, stillOnSite, type LogEntry, type LogKind, type SiteKey } from "./ops";
import { appendText, DictateButton, Segmented } from "./widgets";

/**
 * The site's daily occurrence book (DOB), shared by every officer who
 * works the site. Four views: the book itself (notes, handovers,
 * alarms), visitors, vehicles and keys. Entries are timestamped by the
 * server and can't be edited or deleted — a correction is a new entry.
 */

type View = "book" | "visitors" | "vehicles" | "keys";

export default function OccurrenceLog({ a, officerId, onDuty }: { a: Assignment; officerId: string; onDuty: boolean }) {
  const [view, setView] = useState<View>("book");
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const siteId = a.shift.site.id;

  const load = useCallback(async () => {
    try {
      setEntries(await loadLog(siteId, 3));
      setError(null);
    } catch {
      setError("The log couldn't be loaded. Check your connection.");
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (e: Parameters<typeof addLogEntry>[1]) => {
    const res = await addLogEntry(officerId, e);
    await load();
    return res.queued;
  };

  return (
    <div className="space-y-8">
      <Segmented
        label="Log section"
        value={view}
        onChange={setView}
        options={[
          { value: "book", label: "Book" },
          { value: "visitors", label: "Visitors" },
          { value: "vehicles", label: "Vehicles" },
          { value: "keys", label: "Keys" },
        ]}
      />
      {error && <Notice kind="error">{error}</Notice>}
      {!onDuty && <Notice>You can read the log. Clock in to add entries.</Notice>}
      {!entries ? (
        <Loading label="Loading log" />
      ) : view === "book" ? (
        <Book a={a} entries={entries} onDuty={onDuty} add={add} />
      ) : view === "visitors" ? (
        <Movements a={a} entries={entries} onDuty={onDuty} add={add} kind="visitor" />
      ) : view === "vehicles" ? (
        <Movements a={a} entries={entries} onDuty={onDuty} add={add} kind="vehicle" />
      ) : (
        <Keys a={a} onDuty={onDuty} add={add} />
      )}
    </div>
  );
}

type Add = (e: Parameters<typeof addLogEntry>[1]) => Promise<boolean>;

function Saved({ queued }: { queued: boolean | null }) {
  if (queued === null) return null;
  return <Notice>{queued ? "Saved on this phone. It will be sent when you have signal." : "Added to the log."}</Notice>;
}

/* ---------- the book ---------- */

function Book({ a, entries, onDuty, add }: { a: Assignment; entries: LogEntry[]; onDuty: boolean; add: Add }) {
  const [kind, setKind] = useState<LogKind>("note");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) return setError("Write what happened first.");
    setBusy(true);
    setError(null);
    try {
      setQueued(await add({ site_id: a.shift.site.id, assignment_id: a.id, kind, body: text }));
      setText("");
    } catch {
      setError("That entry couldn't be saved. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {onDuty && (
        <Panel title="New entry">
          <form onSubmit={submit} className="space-y-4">
            <SelectField label="Type" id="log-kind" value={kind} onChange={(e) => setKind(e.target.value as LogKind)}>
              <option value="note">Note</option>
              <option value="handover">Handover for the next officer</option>
              <option value="alarm">Alarm activation</option>
            </SelectField>
            <TextArea
              label={kind === "handover" ? "What the next officer needs to know" : "What happened"}
              id="log-body"
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={10000}
            />
            <DictateButton onText={(t) => setText((cur) => appendText(cur, t))} />
            {error && <Notice kind="error">{error}</Notice>}
            <Saved queued={queued} />
            <PortalButton type="submit" disabled={busy}>
              {busy ? "Saving" : "Add to log"}
            </PortalButton>
          </form>
        </Panel>
      )}
      <Panel title="Last three days" flush>
        {entries.length === 0 ? (
          <Empty>Nothing logged yet.</Empty>
        ) : (
          <ol className="divide-hairline divide-y">
            {entries.map((e) => (
              <li key={e.id} className="px-6 py-4">
                <p className="text-micro text-stone flex flex-wrap gap-x-2 tabular-nums">
                  <span>
                    {fmtShortDay(e.occurred_at)} {fmtTime(e.occurred_at)}
                  </span>
                  <span>· {LOG_KIND_LABEL[e.kind]}</span>
                  <span>· {e.author_name ?? "Officer"}</span>
                  {e.pending && <span>· waiting for signal</span>}
                  {e.offline && !e.pending && <span>· sent late</span>}
                </p>
                <p className="text-caption text-ink mt-1 whitespace-pre-line break-words">{describe(e)}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

function describe(e: LogEntry): string {
  const d = e.details ?? {};
  switch (e.kind) {
    case "visitor_in":
      return [e.subject, d.company && `(${d.company})`, d.host && `to see ${d.host}`, d.badge && `· pass ${d.badge}`].filter(Boolean).join(" ") + (e.body ? `\n${e.body}` : "");
    case "vehicle_in":
      return [e.subject, d.driver && `· ${d.driver}`, d.purpose && `· ${d.purpose}`].filter(Boolean).join(" ") + (e.body ? `\n${e.body}` : "");
    case "visitor_out":
    case "vehicle_out":
      return e.subject ? `${e.subject} left` : "Left site";
    case "key_out":
      return `${d.key ?? "Key"} given to ${e.subject ?? "—"}${e.body ? `\n${e.body}` : ""}`;
    case "key_in":
      return `${d.key ?? "Key"} returned${e.subject ? ` by ${e.subject}` : ""}`;
    default:
      return e.body;
  }
}

/* ---------- visitors and vehicles ---------- */

function Movements({ a, entries, onDuty, add, kind }: { a: Assignment; entries: LogEntry[]; onDuty: boolean; add: Add; kind: "visitor" | "vehicle" }) {
  const inKind = kind === "visitor" ? "visitor_in" : "vehicle_in";
  const outKind = kind === "visitor" ? "visitor_out" : "vehicle_out";
  const onSite = stillOnSite(entries, inKind, outKind);
  const history = entries.filter((e) => e.kind === inKind || e.kind === outKind);
  const [busy, setBusy] = useState<string | null>(null);
  const [queued, setQueued] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const subject = String(f.get("subject") ?? "").trim();
    if (!subject) return setError(kind === "visitor" ? "Enter the visitor's name." : "Enter the registration.");
    setBusy("new");
    setError(null);
    try {
      const details: Record<string, string> = {};
      for (const k of ["company", "host", "badge", "driver", "purpose"]) {
        const v = String(f.get(k) ?? "").trim();
        if (v) details[k] = v;
      }
      setQueued(
        await add({
          site_id: a.shift.site.id,
          assignment_id: a.id,
          kind: inKind,
          subject: kind === "vehicle" ? subject.toUpperCase() : subject,
          details,
          body: String(f.get("notes") ?? ""),
        }),
      );
      form.reset();
    } catch {
      setError("That couldn't be saved. Try again.");
    }
    setBusy(null);
  }

  async function signOut(entry: LogEntry) {
    setBusy(entry.id);
    setError(null);
    try {
      setQueued(await add({ site_id: a.shift.site.id, assignment_id: a.id, kind: outKind, subject: entry.subject, ref_id: entry.id }));
    } catch {
      setError("That couldn't be saved. Try again.");
    }
    setBusy(null);
  }

  return (
    <div className="grid gap-8 xl:grid-cols-2">
      <div className="space-y-8">
        <Panel title={kind === "visitor" ? "On site now" : "Vehicles on site"} flush>
          {onSite.length === 0 ? (
            <Empty>{kind === "visitor" ? "No visitors signed in." : "No vehicles booked in."}</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {onSite.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-caption text-ink break-words">{describe(e).split("\n")[0]}</p>
                    <p className="text-micro text-stone tabular-nums">
                      In at {fmtTime(e.occurred_at)} · {e.author_name ?? "Officer"}
                    </p>
                  </div>
                  {onDuty && (
                    <PortalButton tone="quiet" className="min-h-11" disabled={busy === e.id} onClick={() => signOut(e)}>
                      {kind === "visitor" ? "Sign out" : "Booked out"}
                    </PortalButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {onDuty && (
          <Panel title={kind === "visitor" ? "Sign a visitor in" : "Book a vehicle in"}>
            <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
              {kind === "visitor" ? (
                <>
                  <Field label="Name" id="v-subject" name="subject" autoComplete="off" required />
                  <Field label="Company (optional)" id="v-company" name="company" autoComplete="off" />
                  <Field label="Visiting (optional)" id="v-host" name="host" autoComplete="off" />
                  <Field label="Pass number (optional)" id="v-badge" name="badge" autoComplete="off" />
                </>
              ) : (
                <>
                  <Field label="Registration" id="c-subject" name="subject" autoComplete="off" autoCapitalize="characters" required />
                  <Field label="Driver (optional)" id="c-driver" name="driver" autoComplete="off" />
                  <div className="sm:col-span-2">
                    <Field label="Company or purpose (optional)" id="c-purpose" name="purpose" autoComplete="off" />
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <Field label="Notes (optional)" id={`${kind}-notes`} name="notes" autoComplete="off" />
              </div>
              <div className="space-y-4 sm:col-span-2">
                {error && <Notice kind="error">{error}</Notice>}
                <Saved queued={queued} />
                <PortalButton type="submit" disabled={busy === "new"}>
                  {kind === "visitor" ? "Sign in" : "Book in"}
                </PortalButton>
              </div>
            </form>
          </Panel>
        )}
      </div>
      <Panel title="Last three days" flush>
        {history.length === 0 ? (
          <Empty>Nothing recorded.</Empty>
        ) : (
          <ol className="divide-hairline divide-y">
            {history.map((e) => (
              <li key={e.id} className="flex gap-4 px-6 py-3">
                <span className="text-caption text-stone w-24 shrink-0 tabular-nums">
                  {fmtShortDay(e.occurred_at).split(" ").slice(0, 2).join(" ")} {fmtTime(e.occurred_at)}
                </span>
                <span className="text-caption text-ink min-w-0 break-words">
                  {e.kind.endsWith("_in") ? "In" : "Out"} · {e.subject}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

/* ---------- keys ---------- */

function Keys({ a, onDuty, add }: { a: Assignment; onDuty: boolean; add: Add }) {
  const [keys, setKeys] = useState<SiteKey[] | null>(null);
  const [moves, setMoves] = useState<LogEntry[]>([]);
  const [giving, setGiving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const siteId = a.shift.site.id;

  const load = useCallback(async () => {
    try {
      const [k, m] = await Promise.all([loadKeys(siteId), loadKeyMovements(siteId)]);
      setKeys(k);
      setMoves(m);
    } catch {
      setError("The key register couldn't be loaded.");
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!keys) return error ? <Notice kind="error">{error}</Notice> : <Loading />;
  if (keys.length === 0) return <Panel><p className="text-caption text-stone">No keys are registered for this site. The office adds them.</p></Panel>;

  const latest = (k: SiteKey) => moves.find((m) => m.key_id === k.id);

  async function giveOut(e: SyntheticEvent<HTMLFormElement>, k: SiteKey) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const to = String(f.get("to") ?? "").trim();
    if (!to) return setError("Enter who has the key.");
    setBusy(true);
    setError(null);
    try {
      setQueued(await add({ site_id: siteId, assignment_id: a.id, kind: "key_out", key_id: k.id, subject: to, body: String(f.get("why") ?? ""), details: { key: k.label } }));
      setGiving(null);
      await load();
    } catch {
      setError("That couldn't be saved. Try again.");
    }
    setBusy(false);
  }

  async function giveBack(k: SiteKey, out: LogEntry) {
    setBusy(true);
    setError(null);
    try {
      setQueued(await add({ site_id: siteId, assignment_id: a.id, kind: "key_in", key_id: k.id, subject: out.subject, ref_id: out.id, details: { key: k.label } }));
      await load();
    } catch {
      setError("That couldn't be saved. Try again.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      {error && <Notice kind="error">{error}</Notice>}
      <Saved queued={queued} />
      <Panel title="Key register" flush>
        <ul className="divide-hairline divide-y">
          {keys.map((k) => {
            const m = latest(k);
            const out = m?.kind === "key_out" ? m : null;
            return (
              <li key={k.id} className="px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-caption text-ink">{k.label}</p>
                    {k.notes && <p className="text-micro text-stone">{k.notes}</p>}
                    <div className="mt-1">
                      {out ? (
                        <Status tone="warn" wrap>
                          With {out.subject} since {fmtShortDay(out.occurred_at)} {fmtTime(out.occurred_at)}
                        </Status>
                      ) : (
                        <Status tone="good">In the key safe</Status>
                      )}
                    </div>
                  </div>
                  {onDuty &&
                    (out ? (
                      <PortalButton tone="quiet" className="min-h-11" disabled={busy} onClick={() => giveBack(k, out)}>
                        Returned
                      </PortalButton>
                    ) : (
                      giving !== k.id && (
                        <PortalButton tone="quiet" className="min-h-11" onClick={() => setGiving(k.id)}>
                          Sign out
                        </PortalButton>
                      )
                    ))}
                </div>
                {giving === k.id && (
                  <form onSubmit={(e) => giveOut(e, k)} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Field label="Given to" id={`to-${k.id}`} name="to" autoComplete="off" required />
                    <Field label="Reason (optional)" id={`why-${k.id}`} name="why" autoComplete="off" />
                    <div className="flex gap-3 sm:col-span-2">
                      <PortalButton type="submit" disabled={busy}>
                        Sign key out
                      </PortalButton>
                      <PortalButton tone="quiet" onClick={() => setGiving(null)}>
                        Cancel
                      </PortalButton>
                    </div>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
