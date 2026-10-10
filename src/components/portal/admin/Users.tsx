import { useCallback, useEffect, useState } from "react";
import { supabase, type Profile } from "../../../lib/portalSupabase";
import { Field, fmtShortDay, Loading, Notice, PortalButton } from "../ui";
import { IconPlus, IconSearch } from "./icons";
import InviteForm from "./InviteForm";
import { Empty, Page, PageHeader, Panel, Status, Table, td } from "./kit";
import { listUsers, resetMfa, setRole, type UserRow } from "./opsData";
import { setOfficerActive } from "./adminData";

/**
 * Users and roles: every account (office, officers, client users), with
 * role changes, deactivation and a 2-step verification reset (for
 * someone who lost their phone). Inviting an administrator is here;
 * officers are invited from Officers, client users from Clients.
 * Below: set up your own 2-step verification (an authenticator app such
 * as Google Authenticator or Microsoft Authenticator).
 */

const ROLE_LABEL = { admin: "Administrator", guard: "Officer", client: "Client user" } as const;

export default function Users({ profile }: { profile: Profile }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [inviting, setInviting] = useState(false);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "Couldn't load users." });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(id);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ kind: "info", text: ok });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "That didn't work." });
    }
    setBusy(null);
  }

  const q = query.trim().toLowerCase();
  const shown = (users ?? []).filter((u) => !q || `${u.full_name} ${u.email ?? ""} ${ROLE_LABEL[u.role]}`.toLowerCase().includes(q));
  const link = "text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink disabled:opacity-50";

  return (
    <>
      <PageHeader
        title="Users and roles"
        subtitle={users ? `${users.filter((u) => u.role === "admin" && u.active).length} administrators · ${users.filter((u) => u.role === "guard" && u.active).length} officers · ${users.filter((u) => u.role === "client" && u.active).length} client users` : undefined}
        actions={
          <PortalButton className="min-h-11 gap-2 px-5" onClick={() => setInviting(true)}>
            <IconPlus width={16} height={16} />
            Invite administrator
          </PortalButton>
        }
      />
      <Page>
        {inviting && <InviteForm role="admin" onClose={() => setInviting(false)} onDone={load} />}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <label className="border-hairline bg-paper flex min-h-11 w-full max-w-sm items-center gap-2 border px-3">
          <IconSearch width={16} height={16} className="text-stone shrink-0" />
          <span className="sr-only">Search users</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, role" className="text-caption text-ink w-full bg-transparent focus:outline-none" />
        </label>
        <Panel flush>
          {!users ? (
            <Loading />
          ) : shown.length === 0 ? (
            <Empty>No users match.</Empty>
          ) : (
            <Table head={["Name", "Email", "Role", "Status", ""]}>
              {shown.map((u) => {
                const me = u.id === profile.id;
                return (
                  <tr key={u.id}>
                    <td className={td}>
                      {u.full_name || "—"}
                      {me && <span className="text-micro text-stone block">You</span>}
                      <span className="text-micro text-stone block">Since {fmtShortDay(u.created_at)}</span>
                    </td>
                    <td className={td}>{u.email ?? "—"}</td>
                    <td className={td}>
                      {me ? (
                        ROLE_LABEL[u.role]
                      ) : (
                        <select
                          aria-label={`Role for ${u.full_name || u.email}`}
                          value={u.role}
                          disabled={busy === u.id}
                          onChange={(e) => {
                            const role = e.target.value as UserRow["role"];
                            const warn =
                              role === "client"
                                ? " A client user also needs linking to a client company (invite them from Clients instead)."
                                : role === "admin"
                                  ? " They will be able to see and change everything."
                                  : "";
                            if (confirm(`Make ${u.full_name || u.email} ${ROLE_LABEL[role].toLowerCase()}?${warn}`)) run(u.id, () => setRole(u.id, role), "Role changed.");
                          }}
                          className="text-caption border-ink/30 text-ink min-h-10 border bg-paper px-2"
                        >
                          {Object.entries(ROLE_LABEL).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className={td}>
                      <Status tone={u.active ? "good" : "idle"}>{u.active ? "Active" : "Deactivated"}</Status>
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <button
                        type="button"
                        disabled={busy === u.id}
                        className={`${link} mr-4`}
                        onClick={() => {
                          if (confirm(`Remove 2-step verification for ${u.full_name || u.email}? They'll sign in with just their password until they set it up again.`))
                            run(u.id, () => resetMfa(u.id), "2-step verification reset.");
                        }}
                      >
                        Reset 2-step
                      </button>
                      {!me && (
                        <button
                          type="button"
                          disabled={busy === u.id}
                          className={link}
                          onClick={() => {
                            if (confirm(`${u.active ? "Deactivate" : "Reactivate"} ${u.full_name || u.email}?`)) run(u.id, () => setOfficerActive(u.id, !u.active), u.active ? "Deactivated." : "Reactivated.");
                          }}
                        >
                          {u.active ? "Deactivate" : "Reactivate"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Panel>
        <MyTwoStep />
      </Page>
    </>
  );
}

function MyTwoStep() {
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [enrol, setEnrol] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp?.find((f) => f.status === "verified")?.id ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function start() {
    setBusy(true);
    setMsg(null);
    // Clear any half-finished set-up first.
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (error || !data) return setMsg({ kind: "error", text: error?.message ?? "Couldn't start set-up." });
    setEnrol({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enrol) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrol.id, code: code.replace(/\s+/g, "") });
    setBusy(false);
    if (error) return setMsg({ kind: "error", text: "That code didn't work. Try the current one." });
    setEnrol(null);
    setCode("");
    setMsg({ kind: "info", text: "2-step verification is on. You'll be asked for a code each time you sign in." });
    await load();
  }

  return (
    <Panel title="Your 2-step verification">
      {factorId === undefined ? (
        <Loading />
      ) : factorId ? (
        <div className="space-y-4">
          <Status tone="good">On — a code from your authenticator app is needed at sign-in</Status>
          <PortalButton
            tone="quiet"
            disabled={busy}
            onClick={async () => {
              if (!confirm("Turn off 2-step verification for your account?")) return;
              setBusy(true);
              const { error } = await supabase.auth.mfa.unenroll({ factorId });
              setBusy(false);
              setMsg(error ? { kind: "error", text: error.message } : { kind: "info", text: "Turned off." });
              await load();
            }}
          >
            Turn off
          </PortalButton>
        </div>
      ) : enrol ? (
        <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
          <img src={enrol.qr} alt="QR code to add this account to your authenticator app" className="bg-paper size-48 border border-hairline p-2" />
          <div className="space-y-4">
            <p className="text-caption text-ink">Scan this with your authenticator app, then enter the 6-digit code it shows.</p>
            <p className="text-micro text-stone break-all">Can't scan? Enter this key: {enrol.secret}</p>
            <Field label="Code" id="enrol-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
            <PortalButton disabled={busy} onClick={verify}>
              Turn on
            </PortalButton>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-caption text-ink">Strongly recommended for administrators: after your password, you'll also enter a code from an authenticator app on your phone.</p>
          <PortalButton disabled={busy} onClick={start}>
            Set up 2-step verification
          </PortalButton>
        </div>
      )}
      {msg && (
        <div className="mt-4">
          <Notice kind={msg.kind}>{msg.text}</Notice>
        </div>
      )}
    </Panel>
  );
}

