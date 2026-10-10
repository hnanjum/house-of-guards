import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Field, Loading, Notice, PortalButton } from "../ui";
import { IconPlus } from "./icons";
import { createClient, listClientUsers, listClients, listSites, type Client, type ClientUser, type SiteRow } from "./adminData";
import InviteForm from "./InviteForm";
import { Empty, Page, PageHeader, Panel, Table, td } from "./kit";

/**
 * Clients and the sites linked to them. A site is linked to a client from
 * the site's own form. "Invite user" gives someone at the client a login
 * to the client portal (portal.harleygarrison.co.uk) for their sites only.
 */
export default function Clients() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [inviteFor, setInviteFor] = useState<Client | null>(null);

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
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        onClick={() => setInviteFor(c)}
                        className="text-caption text-ink whitespace-nowrap underline decoration-hairline underline-offset-4 hover:decoration-ink"
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
