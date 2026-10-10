import { useEffect, useState, type SyntheticEvent } from "react";
import { supabase, type Profile } from "../../../lib/portalSupabase";
import { Field, Notice, PortalButton } from "../ui";
import { Page, PageHeader, Panel } from "../admin/kit";
import { loadMyEmail, updateMyPhone } from "./data";

/**
 * Profile: the officer's own details (name and email are set by the
 * office; the phone number is theirs to keep current), password change,
 * and sign out.
 */
export default function ProfilePage({ profile, signOut }: { profile: Profile; signOut: () => Promise<void> }) {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    loadMyEmail().then(setEmail);
  }, []);

  return (
    <>
      <PageHeader offset={false} title="Profile" />
      <Page>
        <div className="grid gap-8 xl:grid-cols-2">
          <Panel title="Your details">
            <dl className="divide-hairline border-hairline divide-y border-b">
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-caption text-stone">Name</dt>
                <dd className="text-caption text-ink text-right">{profile.full_name || "—"}</dd>
              </div>
              <div className="flex justify-between gap-6 py-3">
                <dt className="text-caption text-stone">Email</dt>
                <dd className="text-caption text-ink break-all text-right">{email ?? "—"}</dd>
              </div>
            </dl>
            <p className="text-micro text-stone mt-3">To change your name or email, contact the office.</p>
            <PhoneForm officerId={profile.id} initial={profile.phone} />
          </Panel>

          <div className="space-y-8">
            <Panel title="Change password">
              <PasswordForm />
            </Panel>
            <Panel title="Sign out">
              <p className="text-caption text-stone">Sign out if you're using a shared or borrowed phone.</p>
              <PortalButton tone="quiet" onClick={signOut} className="mt-4">
                Sign out
              </PortalButton>
            </Panel>
          </div>
        </div>
      </Page>
    </>
  );
}

function PhoneForm({ officerId, initial }: { officerId: string; initial: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const phone = String(new FormData(e.currentTarget).get("phone") ?? "").trim();
    setBusy(true);
    setMsg(null);
    try {
      await updateMyPhone(officerId, phone || null);
      setMsg({ kind: "info", text: "Phone number saved." });
    } catch {
      setMsg({ kind: "error", text: "Couldn't save. Try again." });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <Field label="Mobile number" id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={initial ?? ""} hint="So the office can reach you about shifts." />
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <PortalButton type="submit" disabled={busy}>
        {busy ? "Saving" : "Save number"}
      </PortalButton>
    </form>
  );
}

function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const password = String(f.get("new-password") ?? "");
    if (password.length < 12) return setMsg({ kind: "error", text: "Use at least 12 characters." });
    if (password !== String(f.get("confirm-password") ?? "")) return setMsg({ kind: "error", text: "The two passwords don't match." });
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMsg({ kind: "error", text: error.message });
    form.reset();
    setMsg({ kind: "info", text: "Password changed." });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="New password" id="new-password" name="new-password" type="password" autoComplete="new-password" hint="At least 12 characters." required />
      <Field label="Confirm new password" id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" required />
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <PortalButton type="submit" disabled={busy}>
        {busy ? "Saving" : "Change password"}
      </PortalButton>
    </form>
  );
}
