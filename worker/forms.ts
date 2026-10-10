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
 *
 * Spam: a hidden "website" honeypot field (bots fill it; we pretend
 * success and send nothing), a same-origin check, and field length caps.
 * Cloudflare Turnstile can be added later if spam gets through.
 */

export interface FormEnv {
  RESEND_API_KEY?: string;
  FORM_FROM?: string;
  FORM_TO?: string;
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
  return json(200, { ok: true });
}
