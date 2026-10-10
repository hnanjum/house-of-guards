import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Field, fmtShortDay, Loading, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { listOfficers, type Officer } from "./adminData";
import { Empty, Page, PageHeader, Panel, Status } from "./kit";
import { listPoliciesAdmin, savePolicy, type PolicyRow } from "./opsData";

/**
 * Policies and training modules officers must read and confirm. Editing
 * the text can publish a NEW VERSION, which asks every officer to confirm
 * again; small fixes can be saved without one. Shows who has and hasn't
 * confirmed the current version.
 */
export default function AdminPolicies() {
  const [list, setList] = useState<PolicyRow[] | null>(null);
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, o] = await Promise.all([listPoliciesAdmin(), listOfficers()]);
      setList(p);
      setOfficers(o.filter((x) => x.active));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load policies.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const done = async () => {
    setEditing(null);
    await load();
  };

  return (
    <>
      <PageHeader title="Policies and training" actions={editing !== "new" && <PortalButton className="min-h-11 px-5" onClick={() => setEditing("new")}>Add</PortalButton>} />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {editing === "new" && (
          <Panel title="New policy or training module">
            <PolicyForm onDone={done} />
          </Panel>
        )}
        <Panel flush>
          {!list ? (
            <Loading />
          ) : list.length === 0 ? (
            <Empty>Nothing yet. Add your uniform policy, lone-working procedure, or a training module.</Empty>
          ) : (
            <ul className="divide-hairline divide-y">
              {list.map((p) => {
                const confirmed = new Set(p.acks.filter((a) => a.version === p.version).map((a) => a.guard_id));
                const missing = officers.filter((o) => !confirmed.has(o.id));
                return (
                  <li key={p.id} className="px-6 py-5">
                    {editing === p.id ? (
                      <PolicyForm policy={p} onDone={done} />
                    ) : (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-caption text-ink">
                              {p.title} <span className="text-stone">· {p.kind === "training" ? "Training" : "Policy"} v{p.version}</span>
                            </p>
                            <p className="text-micro text-stone">Updated {fmtShortDay(p.updated_at)}{p.active ? "" : " · hidden from officers"}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-4">
                            {p.requires_ack && (
                              <Status tone={missing.length ? "warn" : "good"}>
                                {confirmed.size} of {officers.length} confirmed
                              </Status>
                            )}
                            <button type="button" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink" onClick={() => setEditing(p.id)}>
                              Edit
                            </button>
                          </div>
                        </div>
                        {p.requires_ack && missing.length > 0 && missing.length <= 30 && (
                          <p className="text-micro text-stone mt-2">Not yet: {missing.map((o) => o.full_name || o.email).join(", ")}</p>
                        )}
                      </>
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

function PolicyForm({ policy, onDone }: { policy?: PolicyRow; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const title = String(f.get("title") ?? "").trim();
    const link = String(f.get("link") ?? "").trim();
    if (!title) return setError("Add a title.");
    if (link && !/^https:\/\//.test(link)) return setError("Links must start with https://");
    setBusy(true);
    setError(null);
    try {
      await savePolicy({
        id: policy?.id,
        kind: f.get("kind") as "policy" | "training",
        title,
        summary: String(f.get("summary") ?? "").trim() || null,
        body: String(f.get("body") ?? ""),
        link_url: link || null,
        version: policy ? policy.version + (f.get("bump") === "on" ? 1 : 0) : 1,
        requires_ack: f.get("ack") === "on",
        active: f.get("active") === "on",
        sort_order: policy?.sort_order ?? 0,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  const id = policy?.id ?? "new";
  return (
    <form onSubmit={submit} className="grid gap-5 md:grid-cols-2" noValidate>
      <Field label="Title" id={`p-title-${id}`} name="title" defaultValue={policy?.title} required />
      <SelectField label="Type" id={`p-kind-${id}`} name="kind" defaultValue={policy?.kind ?? "policy"}>
        <option value="policy">Policy</option>
        <option value="training">Training module</option>
      </SelectField>
      <div className="md:col-span-2">
        <Field label="Summary (optional)" id={`p-sum-${id}`} name="summary" defaultValue={policy?.summary ?? ""} />
      </div>
      <div className="md:col-span-2">
        <TextArea label="Full text" id={`p-body-${id}`} name="body" rows={10} defaultValue={policy?.body} />
      </div>
      <div className="md:col-span-2">
        <Field label="Link to a document or video (optional)" id={`p-link-${id}`} name="link" defaultValue={policy?.link_url ?? ""} placeholder="https://" />
      </div>
      <div className="space-y-3 md:col-span-2">
        <label className="text-caption text-ink flex items-center gap-3">
          <input type="checkbox" name="ack" defaultChecked={policy?.requires_ack ?? true} className="accent-electric-blue size-5" />
          Officers must confirm it
        </label>
        <label className="text-caption text-ink flex items-center gap-3">
          <input type="checkbox" name="active" defaultChecked={policy?.active ?? true} className="accent-electric-blue size-5" />
          Visible to officers
        </label>
        {policy && (
          <label className="text-caption text-ink flex items-center gap-3">
            <input type="checkbox" name="bump" className="accent-electric-blue size-5" />
            Publish as a new version (everyone must confirm again)
          </label>
        )}
      </div>
      <div className="space-y-4 md:col-span-2">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-3">
          <PortalButton type="submit" disabled={busy}>
            {busy ? "Saving" : "Save"}
          </PortalButton>
          <PortalButton tone="quiet" onClick={() => onDone()}>
            Cancel
          </PortalButton>
        </div>
      </div>
    </form>
  );
}
