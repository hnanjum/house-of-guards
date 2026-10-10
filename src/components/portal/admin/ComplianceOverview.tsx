import { useCallback, useEffect, useState } from "react";
import type { Profile } from "../../../lib/portalSupabase";
import { fmtShortDay, Loading, Notice, PortalButton } from "../ui";
import { Empty, Page, PageHeader, Panel, Status, Table, td } from "./kit";
import { daysUntil, kindLabel, listDocuments, markRenewed, rejectDocument, sendReminder, verifyDocument, viewFile, type DocumentRow } from "./opsData";
import { Segmented } from "../officers/widgets";

/**
 * Compliance overview: one table of every expiry across all officers,
 * soonest first (expired at the top), with Send reminder (a message the
 * officer must confirm, in their app) and Mark renewed (new expiry date,
 * verified). A second view lists uploads waiting to be checked.
 *
 * Reminders go to the officers app. Email/SMS reminders would need
 * custom SMTP or an SMS provider (not set up yet).
 */
export default function ComplianceOverview({ profile }: { profile: Profile }) {
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [view, setView] = useState<"expiry" | "check">("expiry");
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await listDocuments());
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Couldn't load documents." });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<void>, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ kind: "info", text: ok });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "That didn't work." });
    }
    setBusy(false);
  }

  // Latest document per officer and kind (an older, replaced licence isn't an "expiry" any more).
  const latest = new Map<string, DocumentRow>();
  for (const d of rows ?? []) {
    if (d.rejected_reason || !d.expires_on) continue;
    const key = `${d.guard_id}:${d.kind}:${d.kind === "training" || d.kind === "other" ? d.title : ""}`;
    const prev = latest.get(key);
    if (!prev || d.expires_on > (prev.expires_on ?? "")) latest.set(key, d);
  }
  const expiries = [...latest.values()].sort((a, b) => (a.expires_on ?? "").localeCompare(b.expires_on ?? ""));
  const toCheck = (rows ?? []).filter((d) => !d.verified_at && !d.rejected_reason);
  const link = "text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:opacity-50";

  const open = async (d: DocumentRow) => {
    if (!d.file_path) return;
    const url = await viewFile("officer-documents", d.file_path, "officer_documents", d.id, `${d.officer_name}: ${d.title}`);
    if (url) window.open(url, "_blank", "noopener");
  };

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle={rows ? `${expiries.filter((d) => (daysUntil(d.expires_on) ?? 99) < 0).length} expired · ${expiries.filter((d) => { const l = daysUntil(d.expires_on) ?? 99; return l >= 0 && l <= 60; }).length} within 60 days · ${toCheck.length} to check` : undefined}
        actions={<Segmented label="View" value={view} onChange={setView} options={[{ value: "expiry", label: "Expiry dates" }, { value: "check", label: `To check${toCheck.length ? ` (${toCheck.length})` : ""}` }]} />}
      />
      <Page>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <Panel flush>
          {!rows ? (
            <Loading />
          ) : view === "expiry" ? (
            expiries.length === 0 ? (
              <Empty>No documents with an expiry date yet.</Empty>
            ) : (
              <Table head={["Expires", "Officer", "Document", "Status", ""]}>
                {expiries.map((d) => {
                  const left = daysUntil(d.expires_on)!;
                  return (
                    <tr key={d.id}>
                      <td className={`${td} whitespace-nowrap`}>
                        {left < 0 ? <Status tone="bad">Expired {fmtShortDay(d.expires_on + "T12:00:00Z")}</Status> : left <= 60 ? <Status tone="warn">{left} day{left === 1 ? "" : "s"}</Status> : <span className="tabular-nums">{fmtShortDay(d.expires_on + "T12:00:00Z")}</span>}
                      </td>
                      <td className={td}>
                        <a href={`#/officers/${d.guard_id}/compliance`} className="underline decoration-hairline underline-offset-4 hover:decoration-ink">
                          {d.officer_name}
                        </a>
                      </td>
                      <td className={td}>
                        {d.title}
                        <span className="text-micro text-stone block">{kindLabel(d.kind)}</span>
                      </td>
                      <td className={td}>{d.verified_at ? <Status tone="good">Verified</Status> : <Status tone="warn">Awaiting check</Status>}</td>
                      <td className={`${td} text-right whitespace-nowrap`}>
                        <button type="button" disabled={busy} className={`${link} mr-4`} onClick={() => run(() => sendReminder(profile.id, d.guard_id, d), `Reminder sent to ${d.officer_name}.`)}>
                          Send reminder
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={link}
                          onClick={() => {
                            const date = prompt(`New expiry date for ${d.officer_name}'s ${d.title} (YYYY-MM-DD)`);
                            if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) run(() => markRenewed(d.id, profile.id, date), "Marked renewed.");
                          }}
                        >
                          Mark renewed
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )
          ) : toCheck.length === 0 ? (
            <Empty>Nothing waiting to be checked.</Empty>
          ) : (
            <Table head={["Uploaded", "Officer", "Document", "Expires", ""]}>
              {toCheck.map((d) => (
                <tr key={d.id}>
                  <td className={`${td} whitespace-nowrap`}>{fmtShortDay(d.uploaded_at)}</td>
                  <td className={td}>{d.officer_name}</td>
                  <td className={td}>
                    {d.title}
                    <span className="text-micro text-stone block">
                      {kindLabel(d.kind)}
                      {d.reference ? ` · ${d.reference}` : ""}
                    </span>
                  </td>
                  <td className={`${td} whitespace-nowrap`}>{d.expires_on ? fmtShortDay(d.expires_on + "T12:00:00Z") : "—"}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {d.file_path && (
                      <button type="button" className={`${link} mr-4`} onClick={() => open(d)}>
                        Open (logged)
                      </button>
                    )}
                    <PortalButton className="mr-3 min-h-10 px-4" disabled={busy} onClick={() => run(() => verifyDocument(d.id, profile.id), "Verified.")}>
                      Verify
                    </PortalButton>
                    <button
                      type="button"
                      disabled={busy}
                      className={link}
                      onClick={() => {
                        const reason = prompt("Why can't it be accepted? The officer will see this.");
                        if (reason?.trim()) run(() => rejectDocument(d.id, reason.trim()), "Rejected.");
                      }}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      </Page>
    </>
  );
}
