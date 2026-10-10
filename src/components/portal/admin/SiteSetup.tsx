import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import qrcode from "qrcode-generator";
import { Field, Loading, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { IconPlus } from "./icons";
import { Empty, Panel, Status } from "./kit";
import {
  listCheckpointsAdmin,
  listChecklistsAdmin,
  listKeysAdmin,
  regenerateCheckpointCode,
  saveCheckpoint,
  saveChecklist,
  saveKey,
  type CheckpointRow,
  type ChecklistRow,
  type KeyRow,
} from "./opsData";

/**
 * Per-site setup for officer operations: patrol checkpoints (with a
 * printable sheet of QR stickers), the key register, and checklists.
 * Each checkpoint's QR encodes "HGCP:<secret code>"; officers can only
 * record a scan by reading the sticker, and a code can be replaced if a
 * sticker is copied or damaged.
 */

const link = "text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:opacity-50";

export function qrSvg(text: string, cell = 5) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

/* ---------- checkpoints ---------- */

export function Checkpoints({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<CheckpointRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listCheckpointsAdmin(siteId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load checkpoints.");
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    }
    setBusy(false);
  }

  async function add(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    if (!name) return;
    await run(() => saveCheckpoint({ site_id: siteId, name, sort_order: (items?.at(-1)?.sort_order ?? 0) + 1 }));
    form.reset();
  }

  const active = items?.filter((c) => c.active) ?? [];

  return (
    <Panel
      title="Patrol checkpoints"
      flush
      action={
        active.length > 0 && (
          <a href={`#/sites/${siteId}/qr`} className={link}>
            Print QR stickers
          </a>
        )
      }
    >
      {error && (
        <div className="p-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {!items ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>No checkpoints. Add them in the order officers should walk the route.</Empty>
      ) : (
        <ol className="divide-hairline divide-y">
          {items.map((c, idx) => (
            <li key={c.id} className="flex flex-wrap items-center gap-4 px-6 py-3">
              <span className="text-caption text-stone w-6 tabular-nums">{idx + 1}</span>
              <span className={`text-caption min-w-0 flex-1 ${c.active ? "text-ink" : "text-stone line-through"}`}>{c.name}</span>
              <span className="text-caption flex flex-wrap gap-4">
                <button
                  type="button"
                  disabled={busy || idx === 0}
                  className="text-stone hover:text-ink disabled:opacity-30"
                  onClick={() =>
                    run(async () => {
                      const prev = items[idx - 1];
                      await saveCheckpoint({ ...c, sort_order: prev.sort_order });
                      await saveCheckpoint({ ...prev, sort_order: c.sort_order === prev.sort_order ? c.sort_order + 1 : c.sort_order });
                    })
                  }
                >
                  Up
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={link}
                  onClick={() => {
                    const name = prompt("Checkpoint name", c.name);
                    if (name?.trim()) run(() => saveCheckpoint({ ...c, name: name.trim() }));
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={link}
                  onClick={() => {
                    if (confirm(`Replace the code for "${c.name}"? The printed sticker will stop working; print a new one.`)) run(() => regenerateCheckpointCode(c.id));
                  }}
                >
                  New code
                </button>
                <button type="button" disabled={busy} className={link} onClick={() => run(() => saveCheckpoint({ ...c, active: !c.active }))}>
                  {c.active ? "Retire" : "Restore"}
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <form onSubmit={add} className="border-hairline flex flex-wrap items-end gap-3 border-t p-6">
        <div className="min-w-56 flex-1">
          <Field label="New checkpoint" id={`cp-new-${siteId}`} name="name" placeholder="e.g. Rear fire exit" />
        </div>
        <PortalButton type="submit" disabled={busy} className="gap-2">
          <IconPlus width={16} height={16} />
          Add
        </PortalButton>
      </form>
    </Panel>
  );
}

/** Print view: one sticker per checkpoint (name, QR, and the code to type if a scan fails). */
export function QrSheet({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [items, setItems] = useState<CheckpointRow[] | null>(null);
  useEffect(() => {
    listCheckpointsAdmin(siteId).then((l) => setItems(l.filter((c) => c.active)));
  }, [siteId]);
  const svgs = useMemo(() => (items ?? []).map((c) => ({ c, svg: qrSvg(`HGCP:${c.code}`) })), [items]);
  if (!items) return <Loading />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 print:hidden">
        <PortalButton onClick={() => window.print()}>Print</PortalButton>
        <a href={`#/sites/${siteId}`} className={link}>
          Back to site
        </a>
        <p className="text-caption text-stone">Print on sticker paper, or print and laminate. Fix each at its checkpoint.</p>
      </div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 print:grid-cols-3">
        {svgs.map(({ c, svg }, i) => (
          <div key={c.id} className="border-ink/40 bg-paper break-inside-avoid border border-dashed p-4 text-center">
            <p className="text-micro text-stone">{siteName}</p>
            <p className="text-h4 text-ink mt-1">
              {i + 1}. {c.name}
            </p>
            <div className="mx-auto mt-3 w-full max-w-48" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="text-micro text-stone mt-2 font-mono break-all">{c.code}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- keys ---------- */

export function Keys({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<KeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await listKeysAdmin(siteId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load keys.");
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const label = String(f.get("label") ?? "").trim();
    if (!label) return;
    setBusy(true);
    try {
      await saveKey({ site_id: siteId, label, notes: String(f.get("notes") ?? "").trim() || null });
      form.reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add.");
    }
    setBusy(false);
  }

  return (
    <Panel title="Key register" flush>
      {error && (
        <div className="p-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {!items ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty>No keys registered.</Empty>
      ) : (
        <ul className="divide-hairline divide-y">
          {items.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
              <span className="min-w-0">
                <span className={`text-caption block ${k.active ? "text-ink" : "text-stone line-through"}`}>{k.label}</span>
                {k.notes && <span className="text-micro text-stone block">{k.notes}</span>}
              </span>
              <button
                type="button"
                className={link}
                onClick={async () => {
                  await saveKey({ ...k, active: !k.active });
                  await load();
                }}
              >
                {k.active ? "Remove" : "Restore"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="border-hairline grid gap-3 border-t p-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Key" id={`key-${siteId}`} name="label" placeholder="e.g. Master, tag 01" />
        <Field label="Notes (optional)" id={`keyn-${siteId}`} name="notes" placeholder="e.g. Opens all ground floor" />
        <PortalButton type="submit" disabled={busy}>
          Add key
        </PortalButton>
      </form>
    </Panel>
  );
}

/* ---------- checklists ---------- */

const PROMPT_LABEL = { clock_in: "At clock-in", clock_out: "Before clock-out", any: "Any time" };

/** `siteId` null = checklists that apply to every site (e.g. equipment). */
export function ChecklistsAdmin({ siteId }: { siteId: string | null }) {
  const [items, setItems] = useState<ChecklistRow[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listChecklistsAdmin(siteId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load checklists.");
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  const done = async () => {
    setEditing(null);
    await load();
  };

  return (
    <Panel
      title={siteId ? "Checklists for this site" : "Checklists for every site"}
      flush
      action={
        editing !== "new" && (
          <button type="button" className={link} onClick={() => setEditing("new")}>
            Add checklist
          </button>
        )
      }
    >
      {error && (
        <div className="p-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {editing === "new" && (
        <div className="border-hairline border-b p-6">
          <ChecklistForm siteId={siteId} onDone={done} />
        </div>
      )}
      {!items ? (
        <Loading />
      ) : items.length === 0 && editing !== "new" ? (
        <Empty>{siteId ? "None yet — e.g. opening up, locking up, fire alarm test." : "None yet — e.g. radio, torch, body-worn camera."}</Empty>
      ) : (
        <ul className="divide-hairline divide-y">
          {items.map((c) => (
            <li key={c.id} className="px-6 py-4">
              {editing === c.id ? (
                <ChecklistForm siteId={siteId} list={c} onDone={done} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className={`text-caption ${c.active ? "text-ink" : "text-stone line-through"}`}>{c.name}</p>
                    <p className="text-micro text-stone">
                      {c.kind === "equipment" ? "Equipment" : "Site check"} · {PROMPT_LABEL[c.prompt_at]} · {c.items.length} items
                    </p>
                  </div>
                  <span className="flex items-center gap-4">
                    {!c.active && <Status tone="idle">Off</Status>}
                    <button type="button" className={link} onClick={() => setEditing(c.id)}>
                      Edit
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ChecklistForm({ siteId, list, onDone }: { siteId: string | null; list?: ChecklistRow; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = list?.id ?? `new-${siteId ?? "all"}`;

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const items = String(f.get("items") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name) return setError("Name the checklist.");
    if (!items.length) return setError("Add at least one item, one per line.");
    if (items.length > 60) return setError("Keep it to 60 items or fewer.");
    setBusy(true);
    setError(null);
    try {
      await saveChecklist({
        id: list?.id,
        site_id: siteId,
        kind: f.get("kind") as ChecklistRow["kind"],
        name,
        items,
        prompt_at: f.get("prompt") as ChecklistRow["prompt_at"],
        active: list ? f.get("active") === "on" : true,
        sort_order: list?.sort_order ?? 0,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-3" noValidate>
      <Field label="Name" id={`cl-name-${id}`} name="name" defaultValue={list?.name} placeholder="e.g. Locking up" />
      <SelectField label="Type" id={`cl-kind-${id}`} name="kind" defaultValue={list?.kind ?? (siteId ? "site" : "equipment")}>
        <option value="equipment">Equipment</option>
        <option value="site">Site check</option>
      </SelectField>
      <SelectField label="When" id={`cl-prompt-${id}`} name="prompt" defaultValue={list?.prompt_at ?? "any"}>
        <option value="clock_in">At clock-in</option>
        <option value="clock_out">Before clock-out</option>
        <option value="any">Any time</option>
      </SelectField>
      <div className="md:col-span-3">
        <TextArea label="Items, one per line" id={`cl-items-${id}`} name="items" rows={6} defaultValue={list?.items.join("\n")} />
      </div>
      {list && (
        <label className="text-caption text-ink flex items-center gap-3 md:col-span-3">
          <input type="checkbox" name="active" defaultChecked={list.active} className="accent-electric-blue size-5" />
          In use
        </label>
      )}
      <div className="space-y-3 md:col-span-3">
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
