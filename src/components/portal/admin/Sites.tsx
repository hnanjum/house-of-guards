import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Field, Loading, mapsUrl, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { IconPlus } from "./icons";
import {
  addDays,
  listShifts,
  startOfToday,
  deleteInstruction,
  listClients,
  listInstructions,
  listSites,
  parseCoords,
  saveInstruction,
  saveSite,
  type Client,
  type Instruction,
  type InstructionCategory,
  type SiteRow,
} from "./adminData";
import { Empty, Page, PageHeader, Panel, Status, Table, td } from "./kit";
import { uploadSiteFile, signed } from "./opsData";
import { Checkpoints, ChecklistsAdmin, Keys, QrSheet } from "./SiteSetup";
import { GeofenceMap, SiteContacts, SiteRequirements } from "./SiteExtras";
import { Tabs } from "../officers/widgets";

/**
 * Sites: list, add/edit, and each site's set-up — instructions officers
 * read on shift (post orders, emergency contacts, fire procedures, with
 * attachments such as floor plans), patrol checkpoints with printable
 * QR stickers, the key register, and checklists. Location is entered as
 * one "lat, lng" value pasted from Google Maps; the radius is how far
 * from that point a clock-in still counts as on site.
 */
export default function Sites({ selectedId, sub }: { selectedId?: string; sub?: string }) {
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [guardCount, setGuardCount] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const today = startOfToday();
      const [s, c, sh] = await Promise.all([listSites(), listClients(), listShifts(addDays(today, -30).toISOString(), addDays(today, 30).toISOString())]);
      setSites(s);
      setClients(c);
      const counts: Record<string, Set<string>> = {};
      for (const x of sh) for (const a of x.assignments) if (a.status === "accepted") (counts[x.site_id] ??= new Set()).add(a.guard_id);
      setGuardCount(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.size])));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load sites.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = sites?.find((s) => s.id === selectedId);

  if (selectedId && sites) {
    if (!selected) {
      return (
        <>
          <PageHeader title="Site not found" />
          <Page>
            <a href="#/sites" className="text-caption text-ink underline underline-offset-4">
              All sites
            </a>
          </Page>
        </>
      );
    }
    if (sub === "qr") {
      return (
        <>
          <PageHeader title={`QR stickers · ${selected.name}`} />
          <Page>
            <QrSheet siteId={selected.id} siteName={selected.name} />
          </Page>
        </>
      );
    }
    const tab = (["orders", "checkpoints", "contacts", "requirements"].includes(sub ?? "") ? sub : "details") as SiteTab;
    return <SiteDetail site={selected} clients={clients} tab={tab} onSaved={load} />;
  }

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Sites"
        subtitle={sites ? `${sites.filter((s) => s.active).length} active` : undefined}
        actions={
          <PortalButton onClick={() => setAdding(true)} className="min-h-11 gap-2 px-5">
            <IconPlus width={16} height={16} />
            Add site
          </PortalButton>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {adding && (
          <Panel title="New site">
            <SiteForm
              clients={clients}
              onCancel={() => setAdding(false)}
              onSaved={async () => {
                setAdding(false);
                await load();
              }}
            />
          </Panel>
        )}
        <Panel flush title="All sites">
          {!sites ? (
            <Loading />
          ) : sites.length === 0 ? (
            <Empty>No sites yet. Add the first site you'll be covering.</Empty>
          ) : (
            <Table head={["Site", "Client", "Address", "Officers", "Status"]}>
              {sites.map((s) => (
                <tr key={s.id} className="hover:bg-surface-alt">
                  <td className={td}>
                    <a href={`#/sites/${s.id}`} className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                      {s.name}
                    </a>
                  </td>
                  <td className={td}>{clientName(s.client_id)}</td>
                  <td className={td}>{s.address || "—"}</td>
                  <td className={`${td} tabular-nums`} title="Officers with a confirmed shift here in the last or next 30 days">
                    {guardCount[s.id] ?? 0}
                  </td>
                  <td className={td}>
                    {!s.active ? (
                      <Status tone="idle">Archived</Status>
                    ) : s.latitude == null ? (
                      <Status tone="warn">Active · no location</Status>
                    ) : (
                      <Status tone="good">Active</Status>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
        <ChecklistsAdmin siteId={null} />
      </Page>
    </>
  );
}

const numOrNull = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

function SiteForm({
  site,
  clients,
  onCancel,
  onSaved,
}: {
  site?: SiteRow;
  clients: Client[];
  onCancel?: () => void;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const coordsText = String(f.get("coords") ?? "").trim();
    const coords = coordsText ? parseCoords(coordsText) : null;
    if (coordsText && !coords) return setError('Location should look like "53.7960, -1.7594".');
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveSite({
        id: site?.id,
        name: String(f.get("name")).trim(),
        address: String(f.get("address") ?? "").trim(),
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        geofence_radius_m: Math.max(25, Number(f.get("radius")) || 150),
        client_id: String(f.get("client") ?? "") || null,
        active: site ? f.get("active") === "on" : true,
        contact_name: String(f.get("contact_name") ?? "").trim() || null,
        contact_phone: String(f.get("contact_phone") ?? "").trim() || null,
        patrol_interval_min: numOrNull(f.get("patrol")),
        welfare_interval_min: numOrNull(f.get("welfare")),
        selfie_required: f.get("selfie") === "on",
      });
      setSaved(true);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the site.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
      <Field label="Site name" id="name" name="name" required defaultValue={site?.name} />
      <SelectField label="Client (optional)" id="client" name="client" defaultValue={site?.client_id ?? ""}>
        <option value="">No client</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </SelectField>
      <div className="md:col-span-2">
        <Field label="Address" id="address" name="address" defaultValue={site?.address} />
      </div>
      <Field
        label="Location (latitude, longitude)"
        id="coords"
        name="coords"
        placeholder="53.7960, -1.7594"
        defaultValue={site?.latitude != null ? `${site.latitude}, ${site.longitude}` : ""}
        hint="In Google Maps, right-click the site entrance and click the numbers at the top to copy them."
      />
      <Field
        label="On-site radius (metres)"
        id="radius"
        name="radius"
        type="number"
        min={25}
        max={5000}
        defaultValue={site?.geofence_radius_m ?? 150}
        hint="Clock-ins further away than this are flagged."
      />
      <Field label="Site contact (optional)" id="contact_name" name="contact_name" defaultValue={site?.contact_name ?? ""} placeholder="e.g. Duty manager" />
      <Field label="Site contact phone (optional)" id="contact_phone" name="contact_phone" type="tel" defaultValue={site?.contact_phone ?? ""} />
      <Field
        label="Patrol every (minutes, optional)"
        id="patrol"
        name="patrol"
        type="number"
        min={15}
        max={1440}
        defaultValue={site?.patrol_interval_min ?? ""}
        hint="Control is alerted if no patrol starts in time."
      />
      <Field
        label="Welfare check-in every (minutes, optional)"
        id="welfare"
        name="welfare"
        type="number"
        min={15}
        max={480}
        defaultValue={site?.welfare_interval_min ?? ""}
        hint="For lone workers. Control is alerted if one is missed."
      />
      <label className="text-caption text-ink flex items-center gap-3 md:col-span-2">
        <input type="checkbox" name="selfie" defaultChecked={site?.selfie_required ?? true} className="size-5 accent-electric-blue" />
        Selfie required at clock in and out
      </label>
      {site && (
        <label className="text-caption text-ink flex items-center gap-3 md:col-span-2">
          <input type="checkbox" name="active" defaultChecked={site.active} className="size-5 accent-electric-blue" />
          Active (untick to archive the site)
        </label>
      )}
      {error && (
        <div className="md:col-span-2">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {saved && site && (
        <div className="md:col-span-2">
          <Notice>Saved.</Notice>
        </div>
      )}
      <div className="flex gap-3 md:col-span-2">
        <PortalButton type="submit" disabled={busy}>
          {busy ? "Saving" : site ? "Save changes" : "Add site"}
        </PortalButton>
        {onCancel && (
          <PortalButton tone="quiet" onClick={onCancel}>
            Cancel
          </PortalButton>
        )}
      </div>
    </form>
  );
}

type SiteTab = "details" | "orders" | "checkpoints" | "contacts" | "requirements";

function SiteDetail({ site, clients, tab, onSaved }: { site: SiteRow; clients: Client[]; tab: SiteTab; onSaved: () => Promise<void> }) {
  const base = `#/sites/${site.id}`;
  return (
    <>
      <PageHeader
        title={site.name}
        subtitle={site.address || undefined}
        actions={
          <a href="#/sites" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
            All sites
          </a>
        }
      />
      <Page>
        <Tabs
          active={tab}
          items={[
            { key: "details", href: base, label: "Details and geofence" },
            { key: "orders", href: `${base}/orders`, label: "Post orders" },
            { key: "checkpoints", href: `${base}/checkpoints`, label: "Checkpoints" },
            { key: "contacts", href: `${base}/contacts`, label: "Contacts" },
            { key: "requirements", href: `${base}/requirements`, label: "Shift requirements" },
          ]}
        />
        {tab === "orders" ? (
          <PostOrders site={site} />
        ) : tab === "checkpoints" ? (
          <div className="space-y-8">
            <div className="grid gap-8 xl:grid-cols-2">
              <Checkpoints siteId={site.id} />
              <Keys siteId={site.id} />
            </div>
            <ChecklistsAdmin siteId={site.id} />
          </div>
        ) : tab === "contacts" ? (
          <SiteContacts siteId={site.id} />
        ) : tab === "requirements" ? (
          <SiteRequirements siteId={site.id} />
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel title="Site details">
              <SiteForm site={site} clients={clients} onSaved={onSaved} />
            </Panel>
            <div className="space-y-4">
              <GeofenceMap site={site} />
              {site.latitude != null && (
                <a href={mapsUrl(site)} target="_blank" rel="noopener noreferrer" className="text-caption text-ink inline-block underline decoration-hairline underline-offset-4 hover:decoration-ink">
                  Open in Google Maps
                </a>
              )}
            </div>
          </div>
        )}
      </Page>
    </>
  );
}

function PostOrders({ site }: { site: SiteRow }) {
  const [items, setItems] = useState<Instruction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listInstructions(site.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load instructions.");
    }
  }, [site.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function move(index: number, dir: -1 | 1) {
    if (!items) return;
    const a = items[index];
    const b = items[index + dir];
    if (!b) return;
    await saveInstruction({ ...a, sort_order: b.sort_order === a.sort_order ? a.sort_order + dir : b.sort_order });
    await saveInstruction({ ...b, sort_order: a.sort_order });
    await load();
  }

  return (
    <Panel
      title="Post orders and site instructions"
      flush
      action={
        <PortalButton onClick={() => setEditing("new")} className="min-h-10 gap-2 px-4">
          <IconPlus width={16} height={16} />
          Add
        </PortalButton>
      }
    >
      {error && (
        <div className="p-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {editing === "new" && (
        <div className="border-hairline border-b p-6">
          <InstructionForm
            siteId={site.id}
            nextOrder={(items?.at(-1)?.sort_order ?? 0) + 1}
            onDone={async () => {
              setEditing(null);
              await load();
            }}
          />
        </div>
      )}
      {!items ? (
        <Loading />
      ) : items.length === 0 && editing !== "new" ? (
        <Empty>No instructions yet. Add post orders, emergency contacts, fire procedures and floor plans.</Empty>
      ) : (
        <ol className="divide-hairline divide-y">
          {items.map((i, idx) => (
            <li key={i.id} className="px-6 py-5">
              {editing === i.id ? (
                <InstructionForm
                  siteId={site.id}
                  instruction={i}
                  nextOrder={i.sort_order}
                  onDone={async () => {
                    setEditing(null);
                    await load();
                  }}
                />
              ) : (
                <div className="flex gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="text-micro text-stone">{CATEGORY_LABEL[i.category ?? "general"]}</p>
                    <h3 className="text-h4 text-ink">{i.title}</h3>
                    {i.body && <p className="text-caption text-ink/80 mt-1 whitespace-pre-line">{i.body}</p>}
                    {i.file_path && (
                      <button
                        type="button"
                        className="text-caption text-ink mt-2 underline decoration-hairline underline-offset-4 hover:decoration-ink"
                        onClick={async () => {
                          const url = await signed("site-files", i.file_path!, 300);
                          if (url) window.open(url, "_blank", "noopener");
                        }}
                      >
                        {i.file_name ?? "Attachment"}
                      </button>
                    )}
                  </div>
                  <div className="text-caption flex shrink-0 flex-col items-end gap-1">
                    <button type="button" onClick={() => setEditing(i.id)} className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                      Edit
                    </button>
                    <span className="flex gap-3">
                      <button type="button" disabled={idx === 0} onClick={() => move(idx, -1)} className="text-stone hover:text-ink disabled:opacity-30">
                        Up
                      </button>
                      <button type="button" disabled={idx === items.length - 1} onClick={() => move(idx, 1)} className="text-stone hover:text-ink disabled:opacity-30">
                        Down
                      </button>
                    </span>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

const CATEGORY_LABEL: Record<InstructionCategory, string> = {
  post_orders: "Post orders",
  emergency: "Emergency contacts",
  fire: "Fire procedures",
  access: "Access and keys",
  general: "General",
};

function InstructionForm({
  siteId,
  instruction,
  nextOrder,
  onDone,
}: {
  siteId: string;
  instruction?: Instruction;
  nextOrder: number;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file") as File | null;
    if (file && file.size > 10 * 1024 * 1024) return setError("Attachments must be under 10 MB.");
    setBusy(true);
    setError(null);
    try {
      const uploaded = file && file.size > 0 ? await uploadSiteFile(siteId, file) : null;
      const removeFile = f.get("remove_file") === "on";
      await saveInstruction({
        id: instruction?.id,
        site_id: siteId,
        title: String(f.get("title")).trim(),
        body: String(f.get("body") ?? "").trim(),
        sort_order: instruction?.sort_order ?? nextOrder,
        category: f.get("category") as InstructionCategory,
        ...(uploaded ? { file_path: uploaded.path, file_name: uploaded.name } : removeFile ? { file_path: null, file_name: null } : {}),
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <SelectField label="Section" id={`c-${instruction?.id ?? "new"}`} name="category" defaultValue={instruction?.category ?? "post_orders"}>
        {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </SelectField>
      <Field label="Title" id={`t-${instruction?.id ?? "new"}`} name="title" required defaultValue={instruction?.title} placeholder="e.g. Main gate" />
      <TextArea label="Details" id={`b-${instruction?.id ?? "new"}`} name="body" rows={3} defaultValue={instruction?.body} />
      <div>
        <label htmlFor={`f-${instruction?.id ?? "new"}`} className="text-caption text-ink block">
          Attachment, e.g. floor plan (PDF or image, optional)
        </label>
        <input id={`f-${instruction?.id ?? "new"}`} name="file" type="file" accept="image/*,application/pdf" className="text-caption text-ink mt-2 block" />
        {instruction?.file_path && (
          <label className="text-caption text-ink mt-2 flex items-center gap-3">
            <input type="checkbox" name="remove_file" className="size-5 accent-electric-blue" />
            Remove the current attachment ({instruction.file_name})
          </label>
        )}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <PortalButton type="submit" disabled={busy}>
          {busy ? "Saving" : "Save"}
        </PortalButton>
        <PortalButton tone="quiet" onClick={() => onDone()}>
          Cancel
        </PortalButton>
        {instruction && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!confirm(`Delete "${instruction.title}"?`)) return;
              setBusy(true);
              try {
                await deleteInstruction(instruction.id);
                await onDone();
              } catch {
                setError("Couldn't delete.");
                setBusy(false);
              }
            }}
            className="text-caption text-ink ml-auto underline decoration-magenta underline-offset-4"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
