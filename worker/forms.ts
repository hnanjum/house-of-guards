/**
 * Website form submissions -> email, sent from the Worker via Resend's HTTP
 * API (free tier: 3,000 emails/month, 100/day).
 *
 *   POST /api/enquiry      Get a Quote form   (ContactForm.tsx)
 *   POST /api/application  Careers form       (ApplicationForm.tsx)
 *
 * Both go to FORM_TO (default operations@harleygarrison.co.uk, owner's
 * choice), with Reply-To set to the visitor so "Reply" answers them.
 *
 * Worker settings (Cloudflare dashboard -> Workers -> house-of-guards ->
 * Settings -> Variables and Secrets):
 *   RESEND_API_KEY  secret, required. Without it every submission returns
 *                   503 and the forms tell the visitor it was NOT sent.
 *   FORM_FROM       optional, default "Harley Garrison Website
 *                   <website@harleygarrison.co.uk>" — the domain must be
 *                   verified in Resend.
 *   FORM_TO         optional, default operations@harleygarrison.co.uk.
 *   TURNSTILE_SECRET_KEY  secret, optional. When set, every submission must
 *                   carry a valid Cloudflare Turnstile token. The widget is
 *                   switched on by TURNSTILE_SITE_KEY in src/data/contact.ts:
 *                   deploy that first, or every submission is rejected.
 *
 * Spam: a hidden "website" honeypot field (bots fill it; we pretend
 * success and send nothing), a same-origin check, field length caps and
 * Cloudflare Turnstile.
 *
 * Auto-reply (owner, 2026-10-13): after the team email is sent, the visitor
 * gets a short branded confirmation from operations@ (Reply-To operations@).
 * If that second email fails, the submission still counts as received.
 * Each submission therefore uses 2 of Resend's 100 free emails a day.
 */

export interface FormEnv {
  RESEND_API_KEY?: string;
  FORM_FROM?: string;
  FORM_TO?: string;
  TURNSTILE_SECRET_KEY?: string;
}

type Field = { key: string; label: string; required?: boolean; max: number };

const FORMS: Record<string, { subject: (d: Record<string, string>) => string; fields: Field[] }> = {
  "/api/enquiry": {
    subject: (d) => `Quote enquiry — ${d.firstName} ${d.lastName}${d.service ? ` (${d.service})` : ""}`,
    fields: [
      { key: "firstName", label: "First name", required: true, max: 100 },
      { key: "lastName", label: "Last name", required: true, max: 100 },
      { key: "business", label: "Business name", max: 200 },
      { key: "email", label: "Email", required: true, max: 200 },
      { key: "phone", label: "Phone", max: 50 },
      { key: "service", label: "Service required", required: true, max: 100 },
      { key: "message", label: "Details", max: 5000 },
    ],
  },
  "/api/application": {
    subject: (d) => `Job application — ${d.fullName} (${d.position})`,
    fields: [
      { key: "fullName", label: "Full name", required: true, max: 200 },
      { key: "email", label: "Email", required: true, max: 200 },
      { key: "phone", label: "Phone", required: true, max: 50 },
      { key: "location", label: "Location", required: true, max: 200 },
      { key: "position", label: "Position", required: true, max: 100 },
      { key: "siaBadge", label: "SIA licence", required: true, max: 100 },
      { key: "experience", label: "Experience", max: 5000 },
    ],
  },
};

export const isFormPath = (path: string) => path in FORMS;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function handleForm(request: Request, env: FormEnv, path: string): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method" });

  const origin = request.headers.get("Origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { error: "origin" });

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return json(400, { error: "body" });
  }

  // Honeypot: real visitors never see or fill this field.
  if (typeof raw.website === "string" && raw.website.trim() !== "") return json(200, { ok: true });

  if (env.TURNSTILE_SECRET_KEY) {
    const token = typeof raw["cf-turnstile-response"] === "string" ? (raw["cf-turnstile-response"] as string) : "";
    if (!(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, request))) return json(400, { error: "verification" });
  }

  const form = FORMS[path];
  const data: Record<string, string> = {};
  for (const f of form.fields) {
    const v = typeof raw[f.key] === "string" ? (raw[f.key] as string).trim() : "";
    if (f.required && !v) return json(400, { error: "missing", field: f.key });
    if (v.length > f.max) return json(400, { error: "too-long", field: f.key });
    data[f.key] = v;
  }
  if (!EMAIL_RE.test(data.email)) return json(400, { error: "email" });

  if (!env.RESEND_API_KEY) return json(503, { error: "not-configured" });

  const rows = form.fields.filter((f) => data[f.key]);
  const text = rows.map((f) => `${f.label}: ${data[f.key]}`).join("\n\n");
  const html =
    `<table cellpadding="8" style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">` +
    rows
      .map(
        (f) =>
          `<tr><td style="color:#6e6e6e;vertical-align:top;white-space:nowrap">${escapeHtml(f.label)}</td>` +
          `<td style="white-space:pre-wrap">${escapeHtml(data[f.key])}</td></tr>`,
      )
      .join("") +
    `</table><p style="font-family:Arial,sans-serif;font-size:12px;color:#6e6e6e">Sent from the website form. Reply to answer the sender directly.</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FORM_FROM || "Harley Garrison Website <website@harleygarrison.co.uk>",
      to: [env.FORM_TO || "operations@harleygarrison.co.uk"],
      reply_to: data.email,
      subject: form.subject(data),
      text,
      html,
    }),
  });

  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return json(502, { error: "send-failed" });
  }

  // Confirmation to the visitor. Best effort: never fails the submission.
  try {
    const reply = autoReply(path, data);
    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Harley Garrison <operations@harleygarrison.co.uk>",
        to: [data.email],
        reply_to: "operations@harleygarrison.co.uk",
        subject: reply.subject,
        text: reply.text,
        html: reply.html,
      }),
    });
    if (!sent.ok) console.error("Auto-reply error", sent.status, await sent.text());
  } catch (err) {
    console.error("Auto-reply error", err);
  }
  return json(200, { ok: true });
}

async function verifyTurnstile(token: string, secret: string, request: Request): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const out = (await res.json()) as { success?: boolean };
    return out.success === true;
  } catch {
    return false;
  }
}

/** Branded confirmation email for the visitor (table layout for email clients). */
export function autoReply(path: string, d: Record<string, string>) {
  const application = path === "/api/application";
  const first = (application ? d.fullName : d.firstName).split(/\s+/)[0] || "there";
  const subject = application
    ? "We've received your application | Harley Garrison"
    : "We've received your enquiry | Harley Garrison";
  const paragraphs = application
    ? [
        `Thank you for applying for the ${d.position} role with Harley Garrison. We've received your application.`,
        "We'll review it and get in touch if you're shortlisted. If you're not successful this time, we keep applications for six months in case a suitable role comes up, then delete them.",
        "If any of your details change in the meantime, just reply to this email.",
      ]
    : [
        `Thank you for contacting Harley Garrison. We've received your enquiry${d.service ? ` about ${d.service}` : ""}, and a member of our team will be in touch shortly.`,
        "If your requirement is urgent, please call us on 07414 492363.",
        "If you'd like to add anything, just reply to this email.",
      ];
  const text = [`Dear ${first},`, ...paragraphs, "Kind regards,\nHarley Garrison Operations\n07414 492363 · harleygarrison.co.uk"].join("\n\n");
  const p = (t: string) =>
    `<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0D0D0D">${escapeHtml(t)}</p>`;
  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:24px 0"><tr><td align="center">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF">` +
    `<tr><td style="background:#0D0D0D;padding:24px 32px"><img src="https://harleygarrison.co.uk/logo/email-logo-white.png" width="180" alt="Harley Garrison" style="display:block;border:0"></td></tr>` +
    `<tr><td style="padding:32px">` +
    p(`Dear ${first},`) +
    paragraphs.map(p).join("") +
    `<p style="margin:24px 0 0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#0D0D0D">Kind regards,<br>Harley Garrison Operations</p>` +
    `</td></tr>` +
    `<tr><td style="background:#0D0D0D;padding:20px 32px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#B3B3B3">` +
    `Harley Garrison Ltd · 742 Great Horton Road, Bradford BD7 4EE · 07414 492363<br>` +
    `<a href="https://harleygarrison.co.uk/privacy/" style="color:#FFFFFF">Privacy notice</a> · You received this because you submitted a form on harleygarrison.co.uk.` +
    `</td></tr></table></td></tr></table>`;
  return { subject, text, html };
}
