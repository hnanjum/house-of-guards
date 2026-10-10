import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { Field, Loading, Notice, PortalButton } from "../ui";
import { IconPlus, IconSearch } from "./icons";
import { inviteUser, listOfficers, setOfficerActive, type Officer } from "./adminData";
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
        {inviting && <Invite onClose={() => setInviting(false)} onDone={load} />}

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

function Invite({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const full_name = String(f.get("name") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const r = await inviteUser({ full_name, email: String(f.get("email") ?? "").trim(), role: "guard" });
      setResult({ name: full_name, url: r.invite_url });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The invite couldn't be created.");
    }
    setBusy(false);
  }

  if (result) {
    const message = `Hi ${result.name.split(" ")[0]}, here is your Harley Garrison officer account link. Open it and press "Activate my account": ${result.url}`;
    return (
      <Panel title="Invite ready">
        <div className="space-y-5">
          <p className="text-body text-ink">
            Send this link to {result.name}. It works once and expires in 24 hours.
          </p>
          <p className="text-caption border-hairline bg-surface-alt text-ink break-all border p-4">{result.url}</p>
          <div className="flex flex-wrap gap-3">
            <PortalButton
              onClick={async () => {
                await navigator.clipboard.writeText(result.url);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </PortalButton>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-caption border-ink/20 text-ink inline-flex min-h-12 items-center border px-6 hover:border-ink"
            >
              Send on WhatsApp
            </a>
            <PortalButton tone="quiet" onClick={onClose}>
              Done
            </PortalButton>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Invite an officer">
      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        <Field label="Full name" id="name" name="name" required autoComplete="off" />
        <Field label="Email" id="email" name="email" type="email" required autoComplete="off" hint="They'll sign in with this." />
        {error && (
          <div className="md:col-span-2">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        <div className="flex gap-3 md:col-span-2">
          <PortalButton type="submit" disabled={busy}>
            {busy ? "Creating" : "Create invite"}
          </PortalButton>
          <PortalButton tone="quiet" onClick={onClose}>
            Cancel
          </PortalButton>
        </div>
      </form>
    </Panel>
  );
}
