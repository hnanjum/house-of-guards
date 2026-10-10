import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Field, Loading, mapsUrl, Notice, PortalButton, SelectField, TextArea } from "../ui";
import { IconPlus } from "./icons";
import {
  deleteInstruction,
  listClients,
  listInstructions,
  listSites,
  parseCoords,
  saveInstruction,
  saveSite,
  type Client,
  type Instruction,
  type SiteRow,
} from "./adminData";
import { Empty, Page, PageHeader, Panel, Status, Table, td } from "./kit";

/**
 * Sites: list, add/edit, and each site's instructions (what officers
 * read on their shift screen). Location is entered as one "lat, lng"
 * value pasted from Google Maps; the radius is how far from that point a
 * clock-in still counts as on site.
 */
export default function Sites({ selectedId }: { selectedId?: string }) {
  const [sites, setSites] = useState<SiteRow[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([listSites(), listClients()]);
      setSites(s);
      setClients(c);
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
    return <SiteDetail site={selected} clients={clients} onSaved={load} />;
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
            <Table head={["Site", "Address", "Client", "Location", "Status"]}>
              {sites.map((s) => (
                <tr key={s.id} className="hover:bg-surface-alt">
                  <td className={td}>
                    <a href={`#/sites/${s.id}`} className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
                      {s.name}
                    </a>
                  </td>
                  <td className={td}>{s.address || "—"}</td>
                  <td className={td}>{clientName(s.client_id)}</td>
                  <td className={td}>
                    {s.latitude != null ? (
                      <Status tone="good">Set · {s.geofence_radius_m} m</Status>
                    ) : (
                      <Status tone="warn">Missing</Status>
                    )}
                  </td>
                  <td className={td}>
                    <Status tone={s.active ? "good" : "idle"}>{s.active ? "Active" : "Archived"}</Status>
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

function SiteDetail({ site, clients, onSaved }: { site: SiteRow; clients: Client[]; onSaved: () => Promise<void> }) {
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
        <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Panel
            title="Site instructions"
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
              <Empty>No instructions yet. Add what officers need to know: access, patrol routes, contacts, alarm codes procedure.</Empty>
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
                          <h3 className="text-h4 text-ink">{i.title}</h3>
                          {i.body && <p className="text-caption text-ink/80 mt-1 whitespace-pre-line">{i.body}</p>}
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

          <div className="space-y-8">
            <Panel title="Site details">
              <SiteForm site={site} clients={clients} onSaved={onSaved} />
            </Panel>
            {site.latitude != null && (
              <a href={mapsUrl(site)} target="_blank" rel="noopener noreferrer" className="text-caption text-ink inline-block underline decoration-hairline underline-offset-4 hover:decoration-ink">
                Check the location on Google Maps
              </a>
            )}
          </div>
        </div>
      </Page>
    </>
  );
}

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
    setBusy(true);
    setError(null);
    try {
      await saveInstruction({
        id: instruction?.id,
        site_id: siteId,
        title: String(f.get("title")).trim(),
        body: String(f.get("body") ?? "").trim(),
        sort_order: instruction?.sort_order ?? nextOrder,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" id={`t-${instruction?.id ?? "new"}`} name="title" required defaultValue={instruction?.title} placeholder="e.g. Main gate" />
      <TextArea label="Details" id={`b-${instruction?.id ?? "new"}`} name="body" rows={3} defaultValue={instruction?.body} />
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
