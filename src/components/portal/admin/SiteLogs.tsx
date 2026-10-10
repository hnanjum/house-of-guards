import { useCallback, useEffect, useState } from "react";
import { Field, fmtTime, Loading, Notice, SelectField } from "../ui";
import { addDays, isoDate, listSites, startOfToday, ukToInstant, type SiteRow } from "./adminData";
import { Empty, Page, PageHeader, Panel, Status } from "./kit";
import { listLog, listPatrols, listSubmissions, type BookEntry, type PatrolReport, type SubmissionRow } from "./opsData";
import { LOG_KIND_LABEL, type LogKind } from "../officers/ops";

/**
 * A site's day: the occurrence book (notes, handovers, visitors,
 * vehicles, keys, alarms), every patrol with its checkpoint scans, and
 * every checklist submitted — the record a client or insurer asks for.
 * Days run midnight to midnight UK time. Printable.
 */
export default function SiteLogs() {
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [date, setDate] = useState(isoDate(startOfToday()));
  const [data, setData] = useState<{ log: BookEntry[]; patrols: PatrolReport[]; checks: SubmissionRow[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSites()
      .then((s) => {
        setSites(s);
        if (s[0]) setSiteId((cur) => cur || s.find((x) => x.active)?.id || s[0].id);
      })
      .catch(() => setError("Couldn't load sites."));
  }, []);

  const load = useCallback(async () => {
    if (!siteId) return;
    setData(null);
    try {
      const from = ukToInstant(date);
      const to = addDays(from, 1);
      const [log, patrols, checks] = await Promise.all([
        listLog(siteId, from.toISOString(), to.toISOString()),
        listPatrols(siteId, from.toISOString(), to.toISOString()),
        listSubmissions(siteId, from.toISOString(), to.toISOString()),
      ]);
      setData({ log, patrols, checks });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the log.");
    }
  }, [siteId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const site = sites.find((s) => s.id === siteId);

  return (
    <>
      <PageHeader
        title="Site logs"
        subtitle={site ? site.name : undefined}
        actions={
          <button type="button" onClick={() => window.print()} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
            Print
          </button>
        }
      />
      <Page>
        <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
          <SelectField label="Site" id="log-site" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.active ? "" : " (archived)"}
              </option>
            ))}
          </SelectField>
          <Field label="Day" id="log-date" type="date" value={date} max={isoDate(startOfToday())} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        {error && <Notice kind="error">{error}</Notice>}
        {!data ? (
          siteId ? <Loading /> : <Empty>Add a site first.</Empty>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel title={`Occurrence book (${data.log.length})`} flush>
              {data.log.length === 0 ? (
                <Empty>Nothing logged this day.</Empty>
              ) : (
                <ol className="divide-hairline divide-y">
                  {data.log.map((e) => (
                    <li key={e.id} className="grid gap-1 px-6 py-3 sm:grid-cols-[4.5rem_8rem_minmax(0,1fr)] sm:gap-4">
                      <span className="text-caption text-stone tabular-nums">{fmtTime(e.occurred_at)}</span>
                      <span className="text-caption text-ink">{LOG_KIND_LABEL[e.kind as LogKind] ?? e.kind}</span>
                      <span className="text-caption text-ink min-w-0 break-words whitespace-pre-line">
                        {[e.subject, ...Object.entries(e.details ?? {}).filter(([k]) => k !== "key").map(([, v]) => v), e.details?.key && `(${e.details.key})`]
                          .filter(Boolean)
                          .join(" · ")}
                        {e.subject && e.body ? "\n" : ""}
                        {e.body}
                        <span className="text-micro text-stone block">
                          {e.author_name}
                          {e.offline ? " · sent late" : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
            <div className="space-y-8">
              <Panel title={`Patrols (${data.patrols.length})`} flush>
                {data.patrols.length === 0 ? (
                  <Empty>No patrols this day.</Empty>
                ) : (
                  <ul className="divide-hairline divide-y">
                    {data.patrols.map((p) => (
                      <li key={p.id} className="px-6 py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-caption text-ink tabular-nums">
                            {fmtTime(p.started_at)}
                            {p.ended_at ? ` – ${fmtTime(p.ended_at)}` : " · not ended"} · {p.officer_name}
                          </span>
                          {p.checkpoints_missed ? <Status tone="bad">{p.checkpoints_missed} missed</Status> : p.ended_at ? <Status tone="good">Complete</Status> : <Status tone="warn">Open</Status>}
                        </div>
                        {p.scans.length > 0 && (
                          <p className="text-micro text-stone mt-1">
                            {p.scans.map((s) => `${s.checkpoint} ${fmtTime(s.scanned_at)}${s.in_order ? "" : " (out of order)"}`).join(" · ")}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
              <Panel title={`Checklists (${data.checks.length})`} flush>
                {data.checks.length === 0 ? (
                  <Empty>No checklists this day.</Empty>
                ) : (
                  <ul className="divide-hairline divide-y">
                    {data.checks.map((c) => (
                      <li key={c.id} className="px-6 py-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-caption text-ink tabular-nums">
                            {fmtTime(c.completed_at)} · {c.checklist_name} · {c.officer_name}
                          </span>
                          <Status tone={c.issues ? "warn" : "good"}>{c.issues ? `${c.issues} problem${c.issues === 1 ? "" : "s"}` : "All OK"}</Status>
                        </div>
                        {c.results
                          .filter((r) => !r.ok)
                          .map((r) => (
                            <p key={r.item} className="text-micro text-stone mt-1">
                              {r.item}: {r.note ?? "problem"}
                            </p>
                          ))}
                        {c.notes && <p className="text-micro text-stone mt-1">{c.notes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
