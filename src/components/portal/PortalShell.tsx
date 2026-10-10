import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, type Profile, type UserRole } from "../../lib/portalSupabase";
import { Field, Loading, Notice, PortalButton } from "./ui";

/**
 * Auth gate shared by every portal. Handles sign-in, "forgot password",
 * the set-a-password step that invite and reset emails land on, and the
 * role check (an admin account opening the officers portal is turned
 * away rather than shown an empty screen). The database enforces the
 * same rules independently through RLS; this only shapes the UI.
 *
 * Sign-in screen: Electric Blue identity panel (white logo, Lora
 * portal name; white on Electric Blue ~5.17:1) beside a plain Paper
 * form. On phones the panel becomes a band above the form.
 */

type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "blocked"; message: string }
  | { kind: "ready"; session: Session; profile: Profile };

interface Props {
  portalName: string;
  tagline: string;
  role: UserRole;
  children: (ctx: { profile: Profile; signOut: () => Promise<void> }) => ReactNode;
}

// Invite and password-reset links arrive with the token in the URL hash.
// Read it before supabase-js consumes and clears it.
const arrivedToSetPassword =
  typeof window !== "undefined" && /type=(invite|recovery)/.test(window.location.hash) && !window.location.hash.startsWith("#/activate");

// Invite links made by the admin dashboard (supabase/functions/invite-user)
// look like `#/activate?token_hash=…&type=invite`. The token is only
// redeemed when the person presses the button, so link previews in
// WhatsApp/SMS (which fetch the URL but never run it) can't use it up.
type Activation = { token_hash: string; type: "invite" | "recovery" };
function parseActivation(hash: string): Activation | null {
  const m = hash.match(/^#\/activate\?(.*)$/);
  if (!m) return null;
  const p = new URLSearchParams(m[1]);
  const token_hash = p.get("token_hash");
  const type = p.get("type");
  if (!token_hash || (type !== "invite" && type !== "recovery")) return null;
  return { token_hash, type };
}

export default function PortalShell({ portalName, tagline, role, children }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [needsPassword, setNeedsPassword] = useState(arrivedToSetPassword);
  // 2-step verification: someone with an authenticator app set up must
  // enter a code after their password before the portal opens.
  const [needsCode, setNeedsCode] = useState(false);
  const [activation, setActivation] = useState<Activation | null>(() =>
    typeof window === "undefined" ? null : parseActivation(window.location.hash),
  );

  useEffect(() => {
    let cancelled = false;

    async function resolve(session: Session | null) {
      if (!session) {
        if (!cancelled) setState({ kind: "signed-out" });
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, full_name, phone, active")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      // Offline start (officers on a site with no signal): fall back to
      // the profile saved on this device the last time it loaded. RLS
      // still decides everything once the connection is back.
      const cacheKey = `hg.profile.${session.user.id}`;
      if (error && !navigator.onLine) {
        try {
          const saved = JSON.parse(localStorage.getItem(cacheKey) ?? "null") as Profile | null;
          if (saved?.role === role && saved.active) return setState({ kind: "ready", session, profile: saved });
        } catch {
          /* fall through */
        }
      }
      if (data) {
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data));
        } catch {
          /* storage full or blocked */
        }
      }
      if (error || !data) {
        setState({ kind: "blocked", message: "Your account could not be loaded. Contact the office." });
      } else if (!data.active) {
        setState({ kind: "blocked", message: "This account has been deactivated. Contact the office." });
      } else if (data.role !== role) {
        setState({ kind: "blocked", message: `This account doesn't have access to the ${portalName.toLowerCase()} portal.` });
      } else {
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (cancelled) return;
        setNeedsCode(aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2");
        setState({ kind: "ready", session, profile: data as Profile });
      }
    }

    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") resolve(session);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [role, portalName]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setState({ kind: "signed-out" });
  };

  if (activation) {
    return (
      <AuthFrame portalName={portalName} tagline={tagline}>
        <Activate
          activation={activation}
          onDone={() => {
            history.replaceState(null, "", window.location.pathname);
            setNeedsPassword(true);
            setActivation(null);
          }}
        />
      </AuthFrame>
    );
  }

  if (state.kind === "loading") return <Loading />;

  if (state.kind === "ready" && needsPassword) {
    return (
      <AuthFrame portalName={portalName} tagline={tagline}>
        <SetPassword onDone={() => setNeedsPassword(false)} />
      </AuthFrame>
    );
  }

  if (state.kind === "ready" && needsCode) {
    return (
      <AuthFrame portalName={portalName} tagline={tagline}>
        <CodeChallenge onDone={() => setNeedsCode(false)} onCancel={signOut} />
      </AuthFrame>
    );
  }

  if (state.kind === "ready") return <>{children({ profile: state.profile, signOut })}</>;

  return (
    <AuthFrame portalName={portalName} tagline={tagline}>
      {state.kind === "blocked" ? (
        <div className="space-y-8">
          <Notice kind="error">{state.message}</Notice>
          <PortalButton tone="quiet" onClick={signOut}>
            Sign out
          </PortalButton>
        </div>
      ) : (
        <SignIn />
      )}
    </AuthFrame>
  );
}

function AuthFrame({ portalName, tagline, children }: { portalName: string; tagline: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="on-dark bg-electric-blue text-paper flex flex-col justify-between px-gutter py-10 md:px-12 lg:py-14">
        <a href="https://harleygarrison.co.uk" aria-label="Harley Garrison website">
          <img src="/logo/logo-white.svg" alt="Harley Garrison" width="148" height="40" className="h-9 w-auto" />
        </a>
        <div className="mt-14 lg:mt-0">
          <p className="text-h2 sm:text-h1">{portalName}</p>
          <p className="text-body text-paper/85 mt-4 max-w-sm">{tagline}</p>
        </div>
        <p className="text-micro text-paper/70 mt-14 hidden lg:block">Authorised personnel only. Activity is recorded.</p>
      </div>
      <div className="flex items-center px-gutter py-14 md:px-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

function SignIn() {
  const [mode, setMode] = useState<"sign-in" | "forgot">("sign-in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: String(form.get("password") ?? "") });
      if (error) setError("That email and password don't match an account.");
    } else {
      // Same message whether or not the email exists, so accounts can't be probed.
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/" });
      setSent(true);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate={false}>
      <h1 className="text-h2 text-ink">{mode === "sign-in" ? "Sign in" : "Reset your password"}</h1>
      {mode === "forgot" && (
        <p className="text-body text-stone">Enter your work email and we'll send a link to choose a new password.</p>
      )}
      <Field label="Email" id="email" name="email" type="email" autoComplete="username" required />
      {mode === "sign-in" && (
        <Field label="Password" id="password" name="password" type="password" autoComplete="current-password" required />
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {sent && <Notice>If that email belongs to an account, a reset link is on its way.</Notice>}
      <div className="flex flex-wrap items-center gap-6 pt-2">
        <PortalButton type="submit" disabled={busy}>
          {busy ? "Please wait" : mode === "sign-in" ? "Sign in" : "Send reset link"}
        </PortalButton>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "forgot" : "sign-in");
            setError(null);
            setSent(false);
          }}
          className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
        >
          {mode === "sign-in" ? "Forgot password?" : "Back to sign in"}
        </button>
      </div>
    </form>
  );
}

function Activate({ activation, onDone }: { activation: Activation; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ token_hash: activation.token_hash, type: activation.type });
    setBusy(false);
    if (error) return setError("This link has expired or has already been used. Ask the office to send you a new one.");
    onDone();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-h2 text-ink">{activation.type === "invite" ? "Welcome to Harley Garrison" : "Reset your password"}</h1>
      <p className="text-body text-stone">
        {activation.type === "invite"
          ? "Activate your account, then choose the password you'll sign in with."
          : "Continue to choose a new password."}
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      <PortalButton onClick={go} disabled={busy}>
        {busy ? "Please wait" : activation.type === "invite" ? "Activate my account" : "Continue"}
      </PortalButton>
    </div>
  );
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== String(form.get("confirm") ?? "")) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    history.replaceState(null, "", window.location.pathname);
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <h1 className="text-h2 text-ink">Choose your password</h1>
      <p className="text-body text-stone">You'll use this with your email to sign in from now on.</p>
      <Field label="New password" id="password" name="password" type="password" autoComplete="new-password" hint="At least 12 characters." required />
      <Field label="Confirm password" id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      {error && <Notice kind="error">{error}</Notice>}
      <PortalButton type="submit" disabled={busy}>
        {busy ? "Saving" : "Save password"}
      </PortalButton>
    </form>
  );
}

/** Second step of sign-in for accounts with an authenticator app. */
function CodeChallenge({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s+/g, "");
    if (!/^\d{6}$/.test(code)) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp?.find((f) => f.status === "verified");
    if (!factor) {
      setBusy(false);
      return setError("No authenticator is set up for this account. Contact an administrator.");
    }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    setBusy(false);
    if (error) return setError("That code didn't work. Codes change every 30 seconds — try the current one.");
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div>
        <h1 className="text-h3 text-ink">2-step verification</h1>
        <p className="text-caption text-stone mt-2">Enter the 6-digit code from your authenticator app.</p>
      </div>
      <Field label="Code" id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus />
      {error && <Notice kind="error">{error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <PortalButton type="submit" disabled={busy}>
          {busy ? "Checking" : "Continue"}
        </PortalButton>
        <PortalButton tone="quiet" onClick={onCancel}>
          Sign out
        </PortalButton>
      </div>
      <p className="text-micro text-stone">Lost your phone? An administrator can reset 2-step verification for you.</p>
    </form>
  );
}
