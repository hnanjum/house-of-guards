import { useCallback, useEffect, useMemo, useState } from "react";
import { Loading, Notice, PortalButton } from "../ui";
import { IconPlus, IconSearch } from "./icons";
import { listOfficers, setOfficerActive, type Officer } from "./adminData";
import InviteForm from "./InviteForm";
import { Empty, Page, PageHeader, Panel, Status, Table, td } from "./kit";

/**
 * Officers: searchable list, invite, deactivate/reactivate. Inviting
 * creates the account and returns a one-time link to send by WhatsApp or
 * text (no email needed; see supabase/functions/invite-user).
 */
export default function Officers() {
  const [officers, setOfficers] = useState<Officer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      setOfficers(await listOfficers());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load officers.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!officers) return [];
    return q ? officers.filter((o) => `${o.full_name} ${o.email ?? ""} ${o.phone ?? ""}`.toLowerCase().includes(q)) : officers;
  }, [officers, query]);

  const activeCount = officers?.filter((o) => o.active).length ?? 0;

  return (
    <>
      <PageHeader
        title="Officers"
        subtitle={officers ? `${activeCount} active` : undefined}
        actions={
          <PortalButton onClick={() => setInviting(true)} className="min-h-11 gap-2 px-5">
            <IconPlus width={16} height={16} />
            Invite officer
          </PortalButton>
        }
      />
      <Page>
        {error && <Notice kind="error">{error}</Notice>}
        {inviting && <InviteForm role="guard" onClose={() => setInviting(false)} onDone={load} />}

        <Panel
          flush
          title="All officers"
          action={
            <label className="border-hairline flex min-h-10 w-full max-w-xs items-center gap-2 border px-3">
              <IconSearch width={16} height={16} className="text-stone shrink-0" />
              <span className="sr-only">Search officers</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, email, phone"
                className="text-caption text-ink w-full bg-transparent focus:outline-none"
              />
            </label>
          }
        >
          {!officers ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty>{officers.length ? "No officers match that search." : "No officers yet. Invite your first officer to get started."}</Empty>
          ) : (
            <Table head={["Name", "Email", "Phone", "Status", ""]}>
              {shown.map((o) => (
                <OfficerRow key={o.id} officer={o} onChanged={load} />
              ))}
            </Table>
          )}
        </Panel>
      </Page>
    </>
  );
}

function OfficerRow({ officer, onChanged }: { officer: Officer; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <tr>
      <td className={td}>{officer.full_name || "—"}</td>
      <td className={td}>{officer.email ?? "—"}</td>
      <td className={`${td} tabular-nums`}>{officer.phone ?? "—"}</td>
      <td className={td}>
        <Status tone={officer.active ? "good" : "idle"}>{officer.active ? "Active" : "Deactivated"}</Status>
      </td>
      <td className={`${td} text-right`}>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            const verb = officer.active ? "Deactivate" : "Reactivate";
            if (!confirm(`${verb} ${officer.full_name || officer.email}?`)) return;
            setBusy(true);
            try {
              await setOfficerActive(officer.id, !officer.active);
              await onChanged();
            } finally {
              setBusy(false);
            }
          }}
          className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:opacity-50"
        >
          {officer.active ? "Deactivate" : "Reactivate"}
        </button>
      </td>
    </tr>
  );
}

