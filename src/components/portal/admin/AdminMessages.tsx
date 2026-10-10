import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import type { Profile } from "../../../lib/portalSupabase";
import { Field, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { listOfficers, listSites, type Officer, type SiteRow } from "./adminData";
import { Empty, Page, PageHeader, Panel, Status } from "./kit";
import { listMessages, sendMessage, type MessageRow } from "./opsData";

/**
 * Messages and announcements to officers: everyone, everyone who works a
 * site, or one officer. Optionally "must confirm" (officers tap "I have
 * read and understood"). Read receipts per officer.
 *
 * Officers see a message in their app the next time it refreshes (on
 * opening, on returning to it, and every two minutes). No push/SMS is
 * sent — that needs a messaging provider.
 */
export default function AdminMessages({ profile }: { profile: Profile }) {
  const [list, setList] = useState<MessageRow[] | null>(null);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [composing, setComposing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, o, s] = await Promise.all([listMessages(), listOfficers(), listSites()]);
      setList(m);
      setOfficers(o.filter((x) => x.active));
      setSites(s.filter((x) => x.active));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const audienceLabel = (m: MessageRow) => (m.audience === "all" ? "All officers" : m.audience === "site" ? `Officers at ${m.site_name}` : m.recipient_name ?? "One officer");

  return (
    <>
      <PageHeader title="Messages" subtitle="Announcements and direct messages to officers" actions={!composing && <PortalButton className="min-h-11 px-5" onClick={() => setComposing(true)}>New message</PortalButton>} />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {composing && (
          <Compose
            adminId={profile.id}
            officers={officers}
            sites={sites}
            onClose={() => setComposing(false)}
            onSent={async () => {
              setComposing(false);
              await load();
            }}
          />
        )}
        <Panel flush title="Sent">
          {!list ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty>No messages sent yet.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {list.map((m) => {
                const acked = m.receipts.filter((r) => r.acknowledged_at).length;
                return (
                  <li key={m.id} className="px-6 py-4">
                    <button type="button" className="flex w-full flex-wrap items-start justify-between gap-3 text-left" aria-expanded={open === m.id} onClick={() => setOpen(open === m.id ? null : m.id)}>
                      <span className="min-w-0">
                        <span className="text-caption text-ink block">{m.subject}</span>
                        <span className="text-micro text-stone block tabular-nums">
                          {fmtShortDay(m.created_at)} {fmtTime(m.created_at)} · {audienceLabel(m)}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-3">
                        <Status tone="idle">Read by {m.receipts.length}</Status>
                        {m.requires_ack && <Status tone={acked ? "good" : "warn"}>Confirmed by {acked}</Status>}
                      </span>
                    </button>
                    {open === m.id && (
                      <div className="border-hairline mt-4 border-t pt-4">
                        <p className="text-caption text-ink whitespace-pre-line break-words">{m.body}</p>
                        <h3 className="text-caption text-stone mt-5">Receipts</h3>
                        {m.receipts.length === 0 ? (
                          <p className="text-caption text-stone mt-1">Nobody has opened it yet.</p>
                        ) : (
                          <ul className="mt-2 space-y-1">
                            {m.receipts.map((r) => (
                              <li key={r.guard_id} className="text-caption text-ink tabular-nums">
                                {r.officer_name} · read {fmtShortDay(r.read_at)} {fmtTime(r.read_at)}
                                {r.acknowledged_at ? ` · confirmed ${fmtTime(r.acknowledged_at)}` : ""}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </Page>
    </>
  );
}

function Compose({ adminId, officers, sites, onClose, onSent }: { adminId: string; officers: Officer[]; sites: SiteRow[]; onClose: () => void; onSent: () => Promise<void> }) {
  const [audience, setAudience] = useState<"all" | "site" | "officer">("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const subject = String(f.get("subject") ?? "").trim();
    const body = String(f.get("body") ?? "").trim();
    const site_id = audience === "site" ? String(f.get("site") ?? "") || null : null;
    const recipient_id = audience === "officer" ? String(f.get("officer") ?? "") || null : null;
    if (!subject || !body) return setError("Add a subject and a message.");
    if (audience === "site" && !site_id) return setError("Choose a site.");
    if (audience === "officer" && !recipient_id) return setError("Choose an officer.");
    setBusy(true);
    setError(null);
    try {
      await sendMessage({ sender_id: adminId, audience, site_id, recipient_id, subject, body, requires_ack: f.get("ack") === "on" });
      await onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send.");
      setBusy(false);
    }
  }

  return (
    <Panel title="New message">
      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2" noValidate>
        <SelectField label="To" id="m-aud" value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
          <option value="all">All officers</option>
          <option value="site">Officers who work a site</option>
          <option value="officer">One officer</option>
        </SelectField>
        {audience === "site" ? (
          <SelectField label="Site" id="m-site" name="site" defaultValue="">
            <option value="" disabled>
              Choose a site
            </option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        ) : audience === "officer" ? (
          <SelectField label="Officer" id="m-officer" name="officer" defaultValue="">
            <option value="" disabled>
              Choose an officer
            </option>
            {officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name || o.email}
              </option>
            ))}
          </SelectField>
        ) : (
          <div />
        )}
        <div className="md:col-span-2">
          <Field label="Subject" id="m-subject" name="subject" maxLength={200} required />
        </div>
        <div className="md:col-span-2">
          <TextArea label="Message" id="m-body" name="body" rows={6} maxLength={10000} required />
        </div>
        <label className="text-caption text-ink flex items-center gap-3 md:col-span-2">
          <input type="checkbox" name="ack" className="accent-electric-blue size-5" />
          Officers must confirm they've read and understood it
        </label>
        <div className="space-y-4 md:col-span-2">
          {error && <Notice kind="error">{error}</Notice>}
          <div className="flex gap-3">
            <PortalButton type="submit" disabled={busy}>
              {busy ? "Sending" : "Send"}
            </PortalButton>
            <PortalButton tone="quiet" onClick={onClose}>
              Cancel
            </PortalButton>
          </div>
        </div>
      </form>
    </Panel>
  );
}
