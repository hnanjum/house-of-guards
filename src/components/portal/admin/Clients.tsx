import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Field, Loading, Notice, PortalButton } from "../ui";
import { IconPlus } from "./icons";
import { createClient, listClientUsers, listClients, listSites, type Client, type ClientUser, type SiteRow } from "./adminData";
import InviteForm from "./InviteForm";
import { Empty, Page, PageHeader, Panel, Table, td } from "./kit";
import { CLIENT_SECTIONS, loadClientSettings, saveClientSettings, type ClientSettings } from "./opsData";

/**
 * Clients and the sites linked to them. A site is linked to a client from
 * the site's own form. "Invite user" gives someone at the client a login
 * to the client portal (portal.harleygarrison.co.uk) for their sites only.
 * "Settings" chooses which portal sections the client sees, what may be
 * shared (officer names as "Ahmed N.", GPS locations, attendance times),
 * and the contact details shown to them. "Preview as client" opens their
 * portal exactly as they see it.
 */
export default function Clients() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [inviteFor, setInviteFor] = useState<Client | null>(null);
  const [settingsFor, setSettingsFor] = useState<Client | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, s, u] = await Promise.all([listClients(), listSites(), listClientUsers()]);
      setClients(c);
      setSites(s);
      setUsers(u);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load clients.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={clients ? `${clients.length} client${clients.length === 1 ? "" : "s"}` : undefined}
        actions={
          <PortalButton onClick={() => setAdding(true)} className="min-h-11 gap-2 px-5">
            <IconPlus width={16} height={16} />
            Add client
          </PortalButton>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {adding && <AddClient onClose={() => setAdding(false)} onSaved={load} />}
        {inviteFor && (
          <InviteForm role="client" clientId={inviteFor.id} clientName={inviteFor.name} onClose={() => setInviteFor(null)} onDone={load} />
        )}
        {settingsFor && <SettingsPanel client={settingsFor} onClose={() => setSettingsFor(null)} />}
        <Panel flush title="All clients">
          {!clients ? (
            <Loading />
          ) : clients.length === 0 ? (
            <Empty>No clients yet.</Empty>
          ) : (
            <Table head={["Client", "Sites", "Portal users", ""]}>
              {clients.map((c) => {
                const own = sites.filter((s) => s.client_id === c.id);
                return (
                  <tr key={c.id}>
                    <td className={td}>{c.name}</td>
                    <td className={td}>
                      {own.length === 0 ? (
                        <span className="text-stone">No sites linked</span>
                      ) : (
                        own.map((s, i) => (
                          <span key={s.id}>
                            {i > 0 && ", "}
                            <a href={`#/sites/${s.id}`} className="underline decoration-hairline underline-offset-4 hover:decoration-ink">
                              {s.name}
                            </a>
                          </span>
                        ))
                      )}
                    </td>
                    <td className={td}>
                      {users.filter((u) => u.client_id === c.id).length === 0 ? (
                        <span className="text-stone">None</span>
                      ) : (
                        <ul className="space-y-1">
                          {users
                            .filter((u) => u.client_id === c.id)
                            .map((u) => (
                              <li key={u.user_id}>
                                {u.full_name || u.email}
                                {!u.active && <span className="text-stone"> (deactivated)</span>}
                              </li>
                            ))}
                        </ul>
                      )}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => setSettingsFor(c)}
                        className="text-caption text-ink mr-4 underline decoration-hairline underline-offset-4 hover:decoration-ink"
                      >
                        Settings
                      </button>
                      <a href={`#/preview/${c.id}`} className="text-caption text-ink mr-4 underline decoration-hairline underline-offset-4 hover:decoration-ink">
                        Preview as client
                      </a>
                      <button
                        type="button"
                        onClick={() => setInviteFor(c)}
                        className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
                      >
                        Invite user
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
      </Page>
    </>
  );
}

function AddClient({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await createClient(name);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the client.");
      setBusy(false);
    }
  }

  return (
    <Panel title="New client">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-72 flex-1">
          <Field label="Client name" id="client-name" name="name" required />
        </div>
        <PortalButton type="submit" disabled={busy}>
          {busy ? "Saving" : "Add client"}
        </PortalButton>
        <PortalButton tone="quiet" onClick={onClose}>
          Cancel
        </PortalButton>
        {error && (
          <div className="w-full">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
      </form>
    </Panel>
  );
}

function SettingsPanel({ client, onClose }: { client: Client; onClose: () => void }) {
  const [s, setS] = useState<ClientSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    setS(null);
    loadClientSettings(client.id)
      .then(setS)
      .catch((e) => setMsg({ kind: "error", text: e.message }));
  }, [client.id]);

  if (!s) return <Panel title={`Settings · ${client.name}`}>{msg ? <Notice kind="error">{msg.text}</Notice> : <Loading />}</Panel>;

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const txt = (k: string) => String(f.get(k) ?? "").trim() || null;
    setBusy(true);
    setMsg(null);
    try {
      await saveClientSettings({
        client_id: client.id,
        sections: CLIENT_SECTIONS.map((x) => x.key).filter((k) => f.get(`sec-${k}`) === "on"),
        control_room_phone: txt("crp"),
        account_manager_name: txt("amn"),
        account_manager_phone: txt("amp"),
        account_manager_email: txt("ame"),
        share_names: f.get("share_names") === "on",
        share_locations: f.get("share_locations") === "on",
        share_attendance: f.get("share_attendance") === "on",
      });
      setMsg({ kind: "info", text: "Saved. The client's portal follows these settings straight away." });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save." });
    }
    setBusy(false);
  }

  const box = "accent-electric-blue size-5";
  return (
    <Panel title={`Settings · ${client.name}`} action={<button type="button" onClick={onClose} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">Close</button>}>
      <form onSubmit={submit} className="grid gap-8 xl:grid-cols-3">
        <fieldset className="space-y-2">
          <legend className="text-h4 text-ink mb-2">Sections they see</legend>
          {CLIENT_SECTIONS.map((x) => (
            <label key={x.key} className="text-caption text-ink flex items-center gap-3">
              <input type="checkbox" name={`sec-${x.key}`} defaultChecked={s.sections.includes(x.key)} className={box} />
              {x.label}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-h4 text-ink mb-2">What may be shared</legend>
          <label className="text-caption text-ink flex items-start gap-3">
            <input type="checkbox" name="share_names" defaultChecked={s.share_names} className={`${box} mt-0.5`} />
            <span>Officer names, as first name and last initial (e.g. "Ahmed N.")</span>
          </label>
          <label className="text-caption text-ink flex items-start gap-3">
            <input type="checkbox" name="share_locations" defaultChecked={s.share_locations} className={`${box} mt-0.5`} />
            <span>GPS locations of patrol scans and incident reports (only if the client asks)</span>
          </label>
          <label className="text-caption text-ink flex items-start gap-3">
            <input type="checkbox" name="share_attendance" defaultChecked={s.share_attendance} className={`${box} mt-0.5`} />
            <span>Attendance: arrival and leaving times per shift (e.g. for proof of attendance)</span>
          </label>
          <p className="text-micro text-stone">Never shared: full names, photos of officers, SIA numbers, alerts, internal notes, pay, rota or compliance.</p>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-h4 text-ink mb-2">Contact details shown</legend>
          <Field label="Control room phone" id="crp" name="crp" type="tel" defaultValue={s.control_room_phone ?? ""} />
          <Field label="Account manager" id="amn" name="amn" defaultValue={s.account_manager_name ?? ""} />
          <Field label="Account manager phone" id="amp" name="amp" type="tel" defaultValue={s.account_manager_phone ?? ""} />
          <Field label="Account manager email" id="ame" name="ame" type="email" defaultValue={s.account_manager_email ?? ""} />
        </fieldset>
        <div className="space-y-3 xl:col-span-3">
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <div className="flex flex-wrap gap-3">
            <PortalButton type="submit" disabled={busy}>
              Save settings
            </PortalButton>
            <a href={`#/preview/${client.id}`} className="text-caption border-ink/20 text-ink inline-flex min-h-12 items-center border px-6 hover:border-ink">
              Preview as client
            </a>
          </div>
        </div>
      </form>
    </Panel>
  );
}
