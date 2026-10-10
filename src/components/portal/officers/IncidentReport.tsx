import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import type { Assignment } from "../../../lib/portalSupabase";
import { Field, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { Empty, Page, PageHeader, Panel, Status } from "../admin/kit";
import { isoDate, localToIso } from "../admin/adminData";
import { quickPosition } from "./data";
import { categoryLabel, INCIDENT_CATEGORIES, loadMyIncidents, SEVERITIES, submitIncident, type MyIncident } from "./ops";
import { fmtBytes, MAX_VIDEO_BYTES } from "./media";
import { appendText, DictateButton } from "./widgets";

/**
 * Incident report: what, how serious, when, where (site + GPS), a full
 * description (typed or dictated), people involved, police reference,
 * and photos/video. Sent to control the moment there is signal; high and
 * critical reports also raise an alert in the control room. A submitted
 * report can't be edited — the office adds its own review notes.
 */

const fmtLocalTime = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/London" }).format(d);

export default function IncidentReport({ officerId, assignments, duty }: { officerId: string; assignments: Assignment[] | null; duty: Assignment | null }) {
  const sites = new Map<string, { id: string; name: string; assignment: Assignment }>();
  for (const a of assignments ?? []) if (a.status === "accepted" && !sites.has(a.shift.site.id)) sites.set(a.shift.site.id, { id: a.shift.site.id, name: a.shift.site.name, assignment: a });

  const [siteId, setSiteId] = useState(duty?.shift.site.id ?? "");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ live: boolean } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!siteId && duty) setSiteId(duty.shift.site.id);
  }, [duty, siteId]);

  const now = new Date();

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const site = sites.get(siteId);
    if (!site) return setError("Choose the site this happened at.");
    const title = String(f.get("title") ?? "").trim();
    if (!title) return setError("Give the report a short title.");
    if (!description.trim()) return setError("Describe what happened.");
    const big = files.find((x) => x.size > MAX_VIDEO_BYTES);
    if (big) return setError(`${big.name} is too large (${fmtBytes(big.size)}). Keep each video under 50 MB.`);
    setBusy(true);
    setError(null);
    try {
      const position = await quickPosition();
      const live = await submitIncident(officerId, {
        site_id: site.id,
        site_name: site.name,
        assignment_id: duty && duty.shift.site.id === site.id ? duty.id : site.assignment.id,
        category: String(f.get("category")),
        severity: String(f.get("severity")),
        title,
        description: description.trim(),
        occurred_at: localToIso(String(f.get("date")), String(f.get("time"))),
        police_ref: String(f.get("police") ?? "").trim() || null,
        people: String(f.get("people") ?? "").trim() || null,
        position,
        files,
      });
      setSent({ live });
    } catch {
      setError("The report couldn't be sent. Try again.");
    }
    setBusy(false);
  }

  const header = (
    <PageHeader
      offset={false}
      title="Report an incident"
      actions={
        <a href="#/reports" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
          My reports
        </a>
      }
    />
  );

  if (sent) {
    return (
      <>
        {header}
        <Page>
          <Panel>
            <Notice>{sent.live ? "Report sent to control." : "No signal, so the report is saved on this phone and will be sent automatically as soon as you have one."}</Notice>
            <p className="text-caption text-ink mt-4">If anyone is in danger, call 999 first.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <PortalButton
                onClick={() => {
                  setSent(null);
                  setDescription("");
                  setFiles([]);
                }}
              >
                Write another report
              </PortalButton>
              <a href="#/reports" className="text-caption border-ink/20 text-ink inline-flex min-h-12 items-center border px-6 hover:border-ink">
                My reports
              </a>
            </div>
          </Panel>
        </Page>
      </>
    );
  }

  return (
    <>
      {header}
      <Page>
        {sites.size === 0 ? (
          <Panel>
            <p className="text-caption text-ink">Reports are made against a site you're working. You have no accepted shifts right now.</p>
          </Panel>
        ) : (
          <form onSubmit={submit} className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" noValidate>
            <Panel title="What happened">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <SelectField label="Site" id="inc-site" value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
                    <option value="">Choose a site</option>
                    {[...sites.values()].map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SelectField>
                </div>
                <SelectField label="Type" id="inc-category" name="category" defaultValue="" required>
                  <option value="" disabled>
                    Choose a type
                  </option>
                  {INCIDENT_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </SelectField>
                <SelectField label="Severity" id="inc-severity" name="severity" defaultValue="medium">
                  {SEVERITIES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label} — {s.note}
                    </option>
                  ))}
                </SelectField>
                <div className="sm:col-span-2">
                  <Field label="Short title" id="inc-title" name="title" maxLength={200} placeholder="e.g. Man seen climbing rear fence" required />
                </div>
                <Field label="Date" id="inc-date" name="date" type="date" defaultValue={isoDate(now)} max={isoDate(now)} required />
                <Field label="Time" id="inc-time" name="time" type="time" defaultValue={fmtLocalTime(now)} required />
                <div className="space-y-3 sm:col-span-2">
                  <TextArea
                    label="Full description"
                    id="inc-description"
                    rows={8}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What you saw and heard, in order. Who, what, where, when, and what you did."
                    required
                  />
                  <DictateButton onText={(t) => setDescription((cur) => appendText(cur, t))} />
                </div>
                <div className="sm:col-span-2">
                  <TextArea label="People involved (optional)" id="inc-people" name="people" rows={3} placeholder="Names or descriptions, and how to contact any witnesses." />
                </div>
                <Field label="Police reference (optional)" id="inc-police" name="police" autoComplete="off" />
              </div>
            </Panel>

            <div className="space-y-8">
              <Panel title="Photos and video">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="sr-only"
                  id="inc-files"
                  onChange={(e) => {
                    const picked = Array.from(e.target.files ?? []);
                    setFiles((cur) => [...cur, ...picked].slice(0, 10));
                    e.target.value = "";
                  }}
                />
                <PortalButton tone="quiet" onClick={() => fileInput.current?.click()}>
                  Add photo or video
                </PortalButton>
                <p className="text-micro text-stone mt-2">Up to 10 files. Photos are reduced in size before sending; videos up to 50 MB each.</p>
                {files.length > 0 && (
                  <ul className="divide-hairline border-hairline mt-4 divide-y border">
                    {files.map((f, i) => (
                      <li key={i} className="flex items-center justify-between gap-3 px-4 py-2">
                        <span className="text-caption text-ink min-w-0 truncate">{f.name}</span>
                        <span className="text-micro text-stone shrink-0">{fmtBytes(f.size)}</span>
                        <button type="button" className="text-caption text-ink shrink-0 underline decoration-magenta underline-offset-4" onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}>
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel>
                <p className="text-caption text-ink">Your location is attached automatically if your phone can find it.</p>
                <p className="text-caption text-ink mt-2">If anyone is in danger, call 999 first.</p>
                <div className="mt-6 space-y-4">
                  {error && <Notice kind="error">{error}</Notice>}
                  <PortalButton type="submit" disabled={busy} className="w-full">
                    {busy ? "Sending" : "Send report to control"}
                  </PortalButton>
                </div>
              </Panel>
            </div>
          </form>
        )}
      </Page>
    </>
  );
}

const STATUS: Record<string, { tone: "good" | "warn" | "bad" | "idle"; label: string }> = {
  open: { tone: "warn", label: "With control" },
  reviewing: { tone: "warn", label: "Being reviewed" },
  closed: { tone: "good", label: "Closed" },
  waiting: { tone: "idle", label: "Waiting for signal" },
};

export function MyReports() {
  const [list, setList] = useState<MyIncident[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadMyIncidents()
      .then(setList)
      .catch(() => setError("Your reports couldn't be loaded."));
  }, []);
  return (
    <>
      <PageHeader
        offset={false}
        title="My reports"
        actions={
          <a href="#/report" className="text-caption bg-amber text-ink inline-flex min-h-11 items-center px-5 hover:brightness-95">
            New report
          </a>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!list ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty>You haven't reported any incidents.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {list.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-caption text-ink break-words">{r.title}</p>
                    <p className="text-micro text-stone tabular-nums">
                      {fmtShortDay(r.occurred_at)} {fmtTime(r.occurred_at)} · {categoryLabel(r.category)}
                      {r.site_name ? ` · ${r.site_name}` : ""}
                      {r.media ? ` · ${r.media} file${r.media === 1 ? "" : "s"}` : ""}
                    </p>
                  </div>
                  <Status tone={STATUS[r.status]?.tone ?? "idle"}>{STATUS[r.status]?.label ?? r.status}</Status>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </Page>
    </>
  );
}
