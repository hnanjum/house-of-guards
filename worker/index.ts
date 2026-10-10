import { handleForm, isFormPath, type FormEnv } from "./forms";
/**
 * Cloudflare Worker in front of the static site. It only decides WHICH
 * static files a hostname may see; every response still comes from the
 * built `dist/` assets.
 *
 *   harleygarrison.co.uk, www.     -> public marketing site
 *   officers.harleygarrison.co.uk  -> /officers/*  (officer portal)
 *   admin.harleygarrison.co.uk     -> /admin/*     (management portal)
 *   portal.harleygarrison.co.uk    -> /client/*    (client portal)
 *   *.harleygarrison.com           -> 301 to the same address on .co.uk
 *
 * Portal paths are 404 on the marketing hosts, and each portal host can
 * only reach its own section, so a portal is never reachable under the
 * public site's address. Any other host (workers.dev previews, local
 * `wrangler dev`) is passed straight through so everything stays
 * testable before the custom domains exist.
 *
 * Portal hosts also get defensive headers: no framing, no referrer,
 * no indexing, and no caching of HTML (pages show personal data).
 */

interface Env extends FormEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export const ROOT_DOMAIN = "harleygarrison.co.uk";
const ALT_DOMAIN = "harleygarrison.com";

/** Subdomain -> the section of the built site it serves. */
export const PORTALS: Record<string, string> = {
  officers: "/officers",
  admin: "/admin",
  portal: "/client",
};

const PORTAL_PREFIXES = Object.values(PORTALS);

const isUnder = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");
const isPortalPath = (path: string) => PORTAL_PREFIXES.some((p) => isUnder(path, p));
const hasFileExtension = (path: string) => /\.[a-z0-9]+$/i.test(path.split("/").pop() ?? "");

export type Decision =
  | { kind: "redirect"; location: string }
  | { kind: "not-found" }
  | { kind: "serve"; pathname: string; portal: boolean };

/** Pure routing decision, kept separate so it can be tested without a Worker runtime. */
export function route(rawUrl: string): Decision {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();

  if (host === ALT_DOMAIN || host.endsWith("." + ALT_DOMAIN)) {
    url.hostname = host.slice(0, host.length - ALT_DOMAIN.length) + ROOT_DOMAIN;
    url.protocol = "https:";
    url.port = "";
    return { kind: "redirect", location: url.toString() };
  }

  const ours = host === ROOT_DOMAIN || host.endsWith("." + ROOT_DOMAIN);
  if (!ours) return { kind: "serve", pathname: url.pathname, portal: false };

  const sub = host === ROOT_DOMAIN ? "" : host.slice(0, -(ROOT_DOMAIN.length + 1));
  const prefix = PORTALS[sub];

  if (!prefix) {
    // Marketing site. Unknown subdomains and portal paths do not exist here.
    if (sub !== "" && sub !== "www") return { kind: "not-found" };
    if (isPortalPath(url.pathname)) return { kind: "not-found" };
    return { kind: "serve", pathname: url.pathname, portal: false };
  }

  // Portal host. Shared static files (scripts, fonts, logos) keep their path.
  let path = url.pathname;
  if (isPortalPath(path) && !isUnder(path, prefix)) return { kind: "not-found" };
  if (!hasFileExtension(path) && !isUnder(path, prefix)) {
    path = prefix + (path === "/" ? "/" : path);
  }
  return { kind: "serve", pathname: path, portal: true };
}

const PORTAL_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  // microphone: voice dictation in reports (officers app only uses it on request)
  "Permissions-Policy": "geolocation=(self), camera=(self), microphone=(self)",
  "X-Robots-Tag": "noindex, nofollow",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const decision = route(request.url);

    if (decision.kind === "redirect") return Response.redirect(decision.location, 301);

    if (decision.kind === "not-found") {
      const page = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url), request));
      return new Response(page.body, { status: 404, headers: page.headers });
    }

    // Website form endpoints (marketing hosts only).
    if (!decision.portal && isFormPath(decision.pathname)) return handleForm(request, env, decision.pathname);

    const target = new URL(request.url);
    target.pathname = decision.pathname;
    const response = await env.ASSETS.fetch(new Request(target, request));
    if (!decision.portal) return response;

    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(PORTAL_HEADERS)) headers.set(k, v);
    if ((headers.get("content-type") ?? "").includes("text/html")) headers.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
