/**
 * GitHub sign-in for the Insights editor (/editor/, Sveltia CMS).
 *
 * Implements the small OAuth handshake Decap/Sveltia CMS expect:
 *   /api/cms-auth/auth      -> redirect to GitHub's consent screen
 *   /api/cms-auth/callback  -> swap the code for a token and hand it to
 *                              the editor window via postMessage
 *
 * Needs two Worker secrets (Cloudflare > Workers > house-of-guards >
 * Settings > Variables and Secrets), from a GitHub OAuth App whose
 * callback URL is https://harleygarrison.co.uk/api/cms-auth/callback:
 *   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
 * Without them these routes explain that sign-in isn't set up; the
 * editor's "Sign in with token" option still works.
 *
 * The token only ever goes back to a window on this same origin.
 */

export interface CmsAuthEnv {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
}

const PREFIX = "/api/cms-auth";
export const isCmsAuthPath = (path: string) => path === `${PREFIX}/auth` || path === `${PREFIX}/callback`;

const page = (status: number, script: string, text: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Editor sign-in</title><body style="font-family:sans-serif;padding:2rem">${text}<script>${script}</script></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

/** Message the editor (window.opener) using the Decap handshake. */
const reply = (status: "success" | "error", payload: object, origin: string) => {
  const message = JSON.stringify(`authorization:github:${status}:${JSON.stringify(payload)}`);
  const target = JSON.stringify(origin);
  return page(
    200,
    `(function(){var o=window.opener;if(!o)return;` +
      `window.addEventListener("message",function(e){if(e.origin!==${target})return;o.postMessage(${message},${target});setTimeout(function(){window.close()},300)},false);` +
      `o.postMessage("authorizing:github",${target});})();`,
    status === "success" ? "Signed in. You can close this window." : "Sign-in failed. Close this window and try again.",
  );
};

export async function handleCmsAuth(request: Request, env: CmsAuthEnv, path: string): Promise<Response> {
  const url = new URL(request.url);
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return page(503, "", "Editor sign-in with GitHub is not set up yet. Use “Sign in with token” instead.");
  }

  if (path === `${PREFIX}/auth`) {
    const state = crypto.randomUUID();
    const github = new URL("https://github.com/login/oauth/authorize");
    github.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
    github.searchParams.set("redirect_uri", `${url.origin}${PREFIX}/callback`);
    github.searchParams.set("scope", url.searchParams.get("scope") || "repo");
    github.searchParams.set("state", state);
    return new Response(null, {
      status: 302,
      headers: {
        Location: github.toString(),
        "Set-Cookie": `hg_cms_state=${state}; Path=${PREFIX}; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  // Callback: check state, exchange the code.
  const cookie = request.headers.get("Cookie") ?? "";
  const expected = /(?:^|;\s*)hg_cms_state=([^;]+)/.exec(cookie)?.[1];
  const code = url.searchParams.get("code");
  if (!code || !expected || expected !== url.searchParams.get("state")) {
    return reply("error", { message: "Sign-in expired. Please try again." }, url.origin);
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "harleygarrison-cms" },
    body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!data.access_token) return reply("error", { message: data.error_description || "GitHub refused the sign-in." }, url.origin);
  return reply("success", { token: data.access_token, provider: "github" }, url.origin);
}
