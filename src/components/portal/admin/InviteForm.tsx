import { useState, type SyntheticEvent } from "react";
import { Field, Notice, PortalButton } from "../ui";
import { inviteUser } from "./adminData";
import { Panel } from "./kit";

/**
 * Invite an officer or a client user. Creates the account through the
 * `invite-user` Edge Function and shows a one-time link to send by
 * WhatsApp or text; the person presses "Activate my account" on it and
 * chooses a password. Valid once, for 24 hours.
 */
export default function InviteForm({
  role,
  clientId,
  clientName,
  onClose,
  onDone,
}: {
  role: "guard" | "client" | "admin";
  clientId?: string;
  clientName?: string;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const who = role === "guard" ? "officer" : role === "admin" ? "administrator" : "client user";
  const portal = role === "guard" ? "officer" : role === "admin" ? "admin dashboard" : "client portal";

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const full_name = String(f.get("name") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const r = await inviteUser({ full_name, email: String(f.get("email") ?? "").trim(), role, client_id: clientId ?? null });
      setResult({ name: full_name, url: r.invite_url });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The invite couldn't be created.");
    }
    setBusy(false);
  }

  if (result) {
    const message = `Hi ${result.name.split(" ")[0]}, here is your Harley Garrison ${portal} account link. Open it and press "Activate my account": ${result.url}`;
    return (
      <Panel title="Invite ready">
        <div className="space-y-5">
          <p className="text-body text-ink">Send this link to {result.name}. It works once and expires in 24 hours.</p>
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
    <Panel title={clientName ? `Invite a user for ${clientName}` : `Invite an ${who}`}>
      <form onSubmit={submit} className="grid gap-5 md:grid-cols-2">
        <Field label="Full name" id={`${role}-name`} name="name" required autoComplete="off" />
        <Field label="Email" id={`${role}-email`} name="email" type="email" required autoComplete="off" hint="They'll sign in with this." />
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
