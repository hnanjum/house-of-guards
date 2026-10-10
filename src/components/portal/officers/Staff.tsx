import { useCallback, useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { Field, fmtDay, fmtShortDay, fmtTime, Loading, Notice, PortalButton, SelectField } from "../ui";
import { Empty, Page, PageHeader, Panel, Status } from "../admin/kit";
import {
  IconBook,
  IconCalendarPlus,
  IconClock,
  IconDoc,
  IconFlag,
  IconMessage,
  IconNote,
  IconUser,
} from "../admin/icons";
import {
  acknowledgeMessage,
  acknowledgePolicy,
  addDocument,
  daysLeft,
  deleteDocument,
  DOC_KINDS,
  docKindLabel,
  loadDocuments,
  loadMessages,
  loadOpenShifts,
  loadPayslips,
  loadPolicies,
  markRead,
  requestShift,
  setRequestStatus,
  type Message,
  type OfficerDocument,
  type OpenShift,
  type Payslip,
  type Policy,
} from "./ops";
import { fmtBytes, MAX_FILE_BYTES, signedUrl } from "./media";
import type { OutboxItem } from "./offline";

/**
 * The officer's own admin: messages from control, the document wallet,
 * policies and training, extra shifts on offer, payslips, and the "More"
 * menu that links everything on a phone.
 */

const link = "text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink";

/* ====================== messages ====================== */

export function Messages({ officerId, openId, onRead }: { officerId: string; openId?: string; onRead: () => void }) {
  const [list, setList] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await loadMessages());
    } catch {
      setError("Messages couldn't be loaded.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = list?.find((m) => m.id === openId);

  useEffect(() => {
    if (open && !open.read_at) {
      markRead(open.id, officerId)
        .then(() => {
          load();
          onRead();
        })
        .catch(() => {});
    }
  }, [open, officerId, load, onRead]);

  if (open) {
    return (
      <>
        <PageHeader offset={false} title={open.subject} subtitle={`${fmtDay(open.created_at)}, ${fmtTime(open.created_at)}`} actions={<a href="#/messages" className={link}>All messages</a>} />
        <Page>
          <Panel>
            <p className="text-body text-ink whitespace-pre-line break-words">{open.body}</p>
            {open.requires_ack && (
              <div className="border-hairline mt-8 border-t pt-6">
                {open.acknowledged_at ? (
                  <Status tone="good">You confirmed this on {fmtShortDay(open.acknowledged_at)} at {fmtTime(open.acknowledged_at)}</Status>
                ) : (
                  <AckButton
                    label="I have read and understood this"
                    onAck={async () => {
                      await acknowledgeMessage(open.id, officerId);
                      await load();
                      onRead();
                    }}
                  />
                )}
              </div>
            )}
          </Panel>
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader offset={false} title="Messages" subtitle="From control and the office" />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!list ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty>No messages yet.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {list.map((m) => {
                const unread = !m.read_at;
                const needsAck = m.requires_ack && !m.acknowledged_at;
                return (
                  <li key={m.id}>
                    <a href={`#/messages/${m.id}`} className="hover:bg-surface-alt flex items-start gap-4 px-6 py-4">
                      <span className={`mt-1.5 size-2 shrink-0 ${unread ? "bg-electric-blue" : "bg-transparent"}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="text-caption text-ink block truncate">{m.subject}</span>
                        <span className="text-micro text-stone block truncate">{m.body}</span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-micro text-stone tabular-nums">{fmtShortDay(m.created_at)}</span>
                        {needsAck && <Status tone="warn">Confirm</Status>}
                        {unread && <span className="sr-only">Unread</span>}
                      </span>
                    </a>
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

function AckButton({ label, onAck }: { label: string; onAck: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <PortalButton
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await onAck();
          } catch {
            setError("That didn't go through. Check your connection and try again.");
          }
          setBusy(false);
        }}
      >
        {busy ? "Saving" : label}
      </PortalButton>
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  );
}

/* ====================== documents ====================== */

export function Documents({ officerId }: { officerId: string }) {
  const [docs, setDocs] = useState<OfficerDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setDocs(await loadDocuments());
    } catch {
      setError("Your documents couldn't be loaded.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader offset={false} title="Documents" subtitle="Licences and certificates" actions={!adding && <PortalButton className="min-h-11 px-5" onClick={() => setAdding(true)}>Add document</PortalButton>} />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {adding && (
          <Panel title="Add a document">
            <DocumentForm
              officerId={officerId}
              onCancel={() => setAdding(false)}
              onSaved={async () => {
                setAdding(false);
                await load();
              }}
            />
          </Panel>
        )}
        <Panel flush>
          {!docs ? (
            <Loading />
          ) : docs.length === 0 ? (
            <Empty>Nothing yet. Start with your SIA licence.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {docs.map((d) => (
                <DocumentRow key={d.id} d={d} onChanged={load} />
              ))}
            </ul>
          )}
        </Panel>
        <p className="text-micro text-stone">Only you and the office can see these. The office checks each document and marks it verified.</p>
      </Page>
    </>
  );
}

function DocumentRow({ d, onChanged }: { d: OfficerDocument; onChanged: () => Promise<void> }) {
  const left = daysLeft(d.expires_on);
  const [busy, setBusy] = useState(false);
  const expiry =
    left == null ? null : left < 0 ? (
      <Status tone="bad">Expired {fmtShortDay(d.expires_on! + "T12:00:00Z")}</Status>
    ) : left <= 60 ? (
      <Status tone="warn">Expires in {left} day{left === 1 ? "" : "s"}</Status>
    ) : (
      <Status tone="idle">Expires {fmtShortDay(d.expires_on! + "T12:00:00Z")}</Status>
    );
  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-ink break-words">{d.title}</p>
          <p className="text-micro text-stone">
            {docKindLabel(d.kind)}
            {d.reference ? ` · ${d.reference}` : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {d.rejected_reason ? <Status tone="bad">Not accepted</Status> : d.verified_at ? <Status tone="good">Verified</Status> : <Status tone="idle">Awaiting check</Status>}
          {expiry}
        </div>
      </div>
      {d.rejected_reason && <p className="text-caption text-ink mt-2">Office: {d.rejected_reason}</p>}
      <div className="mt-2 flex flex-wrap gap-4">
        {d.file_path && (
          <button
            type="button"
            className={link}
            onClick={async () => {
              const url = await signedUrl("officer-documents", d.file_path!, 300);
              if (url) window.open(url, "_blank", "noopener");
            }}
          >
            View file
          </button>
        )}
        {!d.verified_at && (
          <button
            type="button"
            disabled={busy}
            className="text-caption text-ink underline decoration-magenta underline-offset-4"
            onClick={async () => {
              if (!confirm(`Remove "${d.title}"?`)) return;
              setBusy(true);
              try {
                await deleteDocument(d);
                await onChanged();
              } catch {
                setBusy(false);
              }
            }}
          >
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

function DocumentForm({ officerId, onCancel, onSaved }: { officerId: string; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [kind, setKind] = useState("sia_licence");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const expires = DOC_KINDS.find((k) => k.value === kind)?.expires;

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim() || docKindLabel(kind);
    if (file && file.size > MAX_FILE_BYTES && !file.type.startsWith("image/")) return setError(`The file is too large (${fmtBytes(file.size)}). The limit is 10 MB.`);
    if (!file) return setError("Add a photo or PDF of the document.");
    setBusy(true);
    setError(null);
    try {
      await addDocument(
        officerId,
        {
          kind,
          title,
          reference: String(f.get("reference") ?? "").trim() || null,
          issued_on: String(f.get("issued") ?? "") || null,
          expires_on: String(f.get("expires") ?? "") || null,
        },
        file,
      );
      await onSaved();
    } catch {
      setError("The document couldn't be uploaded. Documents need signal — try again when you have it.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2" noValidate>
      <SelectField label="Type" id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
        {DOC_KINDS.map((k) => (
          <option key={k.value} value={k.value}>
            {k.label}
          </option>
        ))}
      </SelectField>
      <Field label="Name (optional)" id="doc-title" name="title" placeholder={docKindLabel(kind)} />
      <Field label={kind === "sia_licence" ? "Licence number" : "Reference number (optional)"} id="doc-ref" name="reference" autoComplete="off" />
      <Field label="Issued (optional)" id="doc-issued" name="issued" type="date" />
      {expires && <Field label="Expires" id="doc-expires" name="expires" type="date" hint="We'll remind you 60 days before." />}
      <div className="sm:col-span-2">
        <input ref={input} type="file" accept="image/*,application/pdf" className="sr-only" id="doc-file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <PortalButton tone="quiet" onClick={() => input.current?.click()}>
          {file ? "Choose a different file" : "Photo or PDF of the document"}
        </PortalButton>
        {file && (
          <p className="text-micro text-stone mt-2">
            {file.name} · {fmtBytes(file.size)}
          </p>
        )}
      </div>
      <div className="space-y-4 sm:col-span-2">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex flex-wrap gap-3">
          <PortalButton type="submit" disabled={busy}>
            {busy ? "Uploading" : "Upload"}
          </PortalButton>
          <PortalButton tone="quiet" onClick={onCancel}>
            Cancel
          </PortalButton>
        </div>
      </div>
    </form>
  );
}

/* ====================== policies & training ====================== */

export function Policies({ officerId, openId, onChanged }: { officerId: string; openId?: string; onChanged: () => void }) {
  const [list, setList] = useState<Policy[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setList(await loadPolicies());
    } catch {
      setError("Policies couldn't be loaded.");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = list?.find((p) => p.id === openId);
  if (open) {
    return (
      <>
        <PageHeader offset={false} title={open.title} subtitle={`${open.kind === "training" ? "Training" : "Policy"} · version ${open.version}`} actions={<a href="#/policies" className={link}>All policies</a>} />
        <Page>
          <Panel>
            {open.summary && <p className="text-body text-ink">{open.summary}</p>}
            {open.body && <div className={`text-caption text-ink whitespace-pre-line break-words ${open.summary ? "mt-6" : ""}`}>{open.body}</div>}
            {open.link_url && (
              <a href={open.link_url} target="_blank" rel="noopener noreferrer" className="text-caption border-ink/20 text-ink mt-6 inline-flex min-h-12 items-center border px-6 hover:border-ink">
                {open.kind === "training" ? "Open the training module" : "Open the full document"}
              </a>
            )}
            {open.requires_ack && (
              <div className="border-hairline mt-8 border-t pt-6">
                {open.acked_at ? (
                  <Status tone="good">You confirmed this version on {fmtShortDay(open.acked_at)}</Status>
                ) : (
                  <AckButton
                    label={open.kind === "training" ? "I have completed this training" : "I have read and will follow this policy"}
                    onAck={async () => {
                      await acknowledgePolicy(open, officerId);
                      await load();
                      onChanged();
                    }}
                  />
                )}
              </div>
            )}
          </Panel>
        </Page>
      </>
    );
  }

  return (
    <>
      <PageHeader offset={false} title="Policies and training" />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {!list ? (
          <Loading />
        ) : list.length === 0 ? (
          <Panel>
            <p className="text-caption text-stone">Nothing has been published yet.</p>
          </Panel>
        ) : (
          (["policy", "training"] as const).map((kind) => {
            const items = list.filter((p) => p.kind === kind);
            if (!items.length) return null;
            return (
              <Panel key={kind} title={kind === "policy" ? "Policies" : "Training"} flush>
                <ul className="divide-hairline divide-y">
                  {items.map((p) => (
                    <li key={p.id}>
                      <a href={`#/policies/${p.id}`} className="hover:bg-surface-alt flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                        <span className="min-w-0">
                          <span className="text-caption text-ink block">{p.title}</span>
                          {p.summary && <span className="text-micro text-stone block truncate">{p.summary}</span>}
                        </span>
                        {!p.requires_ack ? null : p.acked_at ? <Status tone="good">Confirmed</Status> : <Status tone="warn">{kind === "training" ? "To complete" : "To read"}</Status>}
                      </a>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })
        )}
      </Page>
    </>
  );
}

/* ====================== extra shifts ====================== */

export function ExtraShifts({ officerId }: { officerId: string }) {
  const [list, setList] = useState<OpenShift[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await loadOpenShifts(officerId));
      setError(null);
    } catch {
      setError("Extra shifts couldn't be loaded. Check your connection.");
    }
  }, [officerId]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(s: OpenShift) {
    setBusy(s.id);
    setError(null);
    try {
      if (!s.request) await requestShift(s.id, officerId, null);
      else await setRequestStatus(s.request.id, s.request.status === "withdrawn" ? "pending" : "withdrawn");
      await load();
    } catch {
      setError("That didn't go through. Try again.");
    }
    setBusy(null);
  }

  const label: Record<string, ReactNode> = {
    pending: <Status tone="warn">Requested</Status>,
    approved: <Status tone="good">Approved</Status>,
    declined: <Status tone="bad">Not this time</Status>,
    withdrawn: <Status tone="idle">Withdrawn</Status>,
  };

  return (
    <>
      <PageHeader offset={false} title="Extra shifts" subtitle="Overtime and open shifts you can ask for" />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!list ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty>No extra shifts are on offer right now.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {list.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-caption text-ink">{s.site_name}</p>
                    <p className="text-micro text-stone tabular-nums">
                      {fmtDay(s.starts_at)}, {fmtTime(s.starts_at)} – {fmtTime(s.ends_at)}
                    </p>
                    {s.notes && <p className="text-micro text-stone mt-1">{s.notes}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    {s.request && label[s.request.status]}
                    {(!s.request || s.request.status === "pending" || s.request.status === "withdrawn") && (
                      <PortalButton tone={s.request?.status === "pending" ? "quiet" : "primary"} className="min-h-11" disabled={busy === s.id} onClick={() => act(s)}>
                        {!s.request ? "Request shift" : s.request.status === "pending" ? "Withdraw" : "Request again"}
                      </PortalButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <p className="text-micro text-stone">The office confirms requests. An approved shift appears under My shifts.</p>
      </Page>
    </>
  );
}

/* ====================== payslips ====================== */

export function Payslips() {
  const [list, setList] = useState<Payslip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadPayslips()
      .then(setList)
      .catch(() => setError("Payslips couldn't be loaded."));
  }, []);
  return (
    <>
      <PageHeader offset={false} title="Payslips" />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        <Panel flush>
          {!list ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty>No payslips have been added yet.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {list.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-4 px-6 py-4">
                  <span className="text-caption text-ink">{p.period_label}</span>
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className={link}>
                    Open payslip
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <p className="text-micro text-stone">Payslips open on the payroll provider's site.</p>
      </Page>
    </>
  );
}

/* ====================== more (phone menu) + outbox ====================== */

export const MORE_LINKS = [
  { href: "#/extra", label: "Extra shifts", Icon: IconCalendarPlus },
  { href: "#/reports", label: "My incident reports", Icon: IconFlag },
  { href: "#/timesheet", label: "Timesheet", Icon: IconClock },
  { href: "#/payslips", label: "Payslips", Icon: IconNote },
  { href: "#/documents", label: "Documents", Icon: IconDoc },
  { href: "#/policies", label: "Policies and training", Icon: IconBook },
  { href: "#/messages", label: "Messages", Icon: IconMessage },
  { href: "#/profile", label: "Profile", Icon: IconUser },
];

export function More({ outbox }: { outbox: { waiting: OutboxItem[]; failed: OutboxItem[]; online: boolean; flush: () => Promise<void>; discard: (id: string) => Promise<void> } }) {
  return (
    <>
      <PageHeader offset={false} title="More" />
      <Page>
        <Panel flush>
          <ul className="divide-hairline divide-y">
            {MORE_LINKS.map(({ href, label, Icon }) => (
              <li key={href}>
                <a href={href} className="hover:bg-surface-alt text-caption text-ink flex min-h-14 items-center gap-4 px-6">
                  <Icon />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </Panel>
        <OutboxPanel outbox={outbox} />
      </Page>
    </>
  );
}

export function OutboxPanel({ outbox }: { outbox: Parameters<typeof More>[0]["outbox"] }) {
  const [busy, setBusy] = useState(false);
  if (!outbox.waiting.length && !outbox.failed.length) return null;
  return (
    <Panel title="Saved on this phone" flush>
      <ul className="divide-hairline divide-y">
        {[...outbox.waiting, ...outbox.failed].map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
            <span className="min-w-0">
              <span className="text-caption text-ink block break-words">{i.label}</span>
              <span className="text-micro text-stone block tabular-nums">
                {fmtShortDay(i.created_at)} {fmtTime(i.created_at)}
                {i.error ? ` · refused: ${i.error}` : " · waiting to send"}
              </span>
            </span>
            {i.error && (
              <button
                type="button"
                className="text-caption text-ink underline decoration-magenta underline-offset-4"
                onClick={() => {
                  if (confirm("Delete this record from the phone? It will not reach the office.")) outbox.discard(i.id);
                }}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {outbox.waiting.length > 0 && (
        <div className="p-6">
          <PortalButton
            tone="quiet"
            disabled={busy || !outbox.online}
            onClick={async () => {
              setBusy(true);
              await outbox.flush();
              setBusy(false);
            }}
          >
            {!outbox.online ? "No signal" : busy ? "Sending" : "Send now"}
          </PortalButton>
        </div>
      )}
    </Panel>
  );
}
