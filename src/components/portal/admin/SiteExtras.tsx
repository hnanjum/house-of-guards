import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import "leaflet/dist/leaflet.css";
import { Field, Loading, Notice, PortalButton, TextArea } from "../ui";
import { Empty, Panel } from "./kit";
import type { SiteRow } from "./adminData";
import { deleteSiteContact, listSiteContacts, loadSiteRequirements, saveSiteContact, saveSiteRequirements, type SiteContact } from "./opsData";
import { DOC_KINDS } from "../officers/ops";

/**
 * Site detail extras: the geofence map, the site's contacts (the control
 * room's call list), and shift requirements (documents an officer must
 * hold to be offered shifts here, plus free-text requirements).
 *
 * The map uses OpenStreetMap tiles through Leaflet (loaded only on this
 * screen). It draws the site point and its on-site radius.
 */

export function GeofenceMap({ site }: { site: SiteRow }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!el.current || site.latitude == null || site.longitude == null) return;
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const centre: [number, number] = [site.latitude!, site.longitude!];
      // Colours come from the site's own tokens (global.css), not literals.
      const token = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      map = L.map(el.current, { scrollWheelZoom: false }).setView(centre, 16);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const circle = L.circle(centre, { radius: site.geofence_radius_m, color: token("--color-electric-blue"), weight: 2, fillOpacity: 0.12 }).addTo(map);
      L.circleMarker(centre, { radius: 5, color: token("--color-ink"), weight: 2, fillColor: token("--color-paper"), fillOpacity: 1 }).addTo(map);
      map.fitBounds(circle.getBounds(), { padding: [24, 24] });
    });
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [site.latitude, site.longitude, site.geofence_radius_m]);

  if (site.latitude == null) {
    return (
      <Panel title="Geofence">
        <p className="text-caption text-stone">No location set yet. Add the site's coordinates in the details to see its on-site area.</p>
      </Panel>
    );
  }
  return (
    <Panel title={`Geofence · ${site.geofence_radius_m} m radius`} flush>
      <div ref={el} className="h-80 w-full" role="img" aria-label={`Map of ${site.name} with its ${site.geofence_radius_m} metre on-site area`} />
      <p className="text-micro text-stone px-6 py-3">Clock-ins outside the blue circle are flagged.</p>
    </Panel>
  );
}

/* ---------- contacts ---------- */

export function SiteContacts({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<SiteContact[] | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listSiteContacts(siteId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load contacts.");
    }
  }, [siteId]);

  useEffect(() => {
    load();
  }, [load]);

  const done = async () => {
    setEditing(null);
    await load();
  };

  return (
    <Panel
      title="Site contacts"
      flush
      action={
        editing !== "new" && (
          <button type="button" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink" onClick={() => setEditing("new")}>
            Add contact
          </button>
        )
      }
    >
      {error && (
        <div className="p-6">
          <Notice kind="error">{error}</Notice>
        </div>
      )}
      {editing === "new" && (
        <div className="border-hairline border-b p-6">
          <ContactForm siteId={siteId} nextOrder={(items?.length ?? 0) + 1} onDone={done} />
        </div>
      )}
      {!items ? (
        <Loading />
      ) : items.length === 0 && editing !== "new" ? (
        <Empty>No contacts. Add the people control should call, in order.</Empty>
      ) : (
        <ol className="divide-hairline divide-y">
          {items.map((c) => (
            <li key={c.id} className="px-6 py-4">
              {editing === c.id ? (
                <ContactForm siteId={siteId} contact={c} nextOrder={c.call_order} onDone={done} />
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-caption text-ink">
                      <span className="text-stone tabular-nums">{c.call_order}. </span>
                      {c.name}
                      {c.role ? `, ${c.role}` : ""}
                      {c.emergency ? " · on the emergency call list" : ""}
                    </p>
                    <p className="text-micro text-stone">
                      {[c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email"}
                      {c.notes ? ` · ${c.notes}` : ""}
                    </p>
                  </div>
                  <span className="flex gap-4">
                    <button type="button" className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink" onClick={() => setEditing(c.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-caption text-ink underline decoration-magenta underline-offset-4"
                      onClick={async () => {
                        if (!confirm(`Remove ${c.name}?`)) return;
                        await deleteSiteContact(c.id);
                        await load();
                      }}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <p className="text-micro text-stone px-6 py-3">Officers working this site see these contacts. Control sees them as the call list on each alert.</p>
    </Panel>
  );
}

function ContactForm({ siteId, contact, nextOrder, onDone }: { siteId: string; contact?: SiteContact; nextOrder: number; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = contact?.id ?? "new";

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    if (!name) return setError("Enter a name.");
    setBusy(true);
    setError(null);
    try {
      await saveSiteContact({
        id: contact?.id,
        site_id: siteId,
        name,
        role: String(f.get("role") ?? "").trim() || null,
        phone: String(f.get("phone") ?? "").trim() || null,
        email: String(f.get("email") ?? "").trim() || null,
        call_order: Math.max(1, Number(f.get("order")) || nextOrder),
        emergency: f.get("emergency") === "on",
        notes: String(f.get("notes") ?? "").trim() || null,
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2" noValidate>
      <Field label="Name" id={`sc-n-${id}`} name="name" defaultValue={contact?.name} />
      <Field label="Role (optional)" id={`sc-r-${id}`} name="role" defaultValue={contact?.role ?? ""} placeholder="e.g. Duty manager, keyholder" />
      <Field label="Phone" id={`sc-p-${id}`} name="phone" type="tel" defaultValue={contact?.phone ?? ""} />
      <Field label="Email (optional)" id={`sc-e-${id}`} name="email" type="email" defaultValue={contact?.email ?? ""} />
      <Field label="Call order" id={`sc-o-${id}`} name="order" type="number" min={1} defaultValue={contact?.call_order ?? nextOrder} />
      <Field label="Notes (optional)" id={`sc-x-${id}`} name="notes" defaultValue={contact?.notes ?? ""} />
      <label className="text-caption text-ink flex items-center gap-3 md:col-span-2">
        <input type="checkbox" name="emergency" defaultChecked={contact?.emergency ?? false} className="accent-electric-blue size-5" />
        Call first in an emergency
      </label>
      <div className="space-y-3 md:col-span-2">
        {error && <Notice kind="error">{error}</Notice>}
        <div className="flex gap-3">
          <PortalButton type="submit" disabled={busy}>
            Save
          </PortalButton>
          <PortalButton tone="quiet" onClick={() => onDone()}>
            Cancel
          </PortalButton>
        </div>
      </div>
    </form>
  );
}

/* ---------- requirements ---------- */

export function SiteRequirements({ siteId }: { siteId: string }) {
  const [state, setState] = useState<{ required_documents: string[]; requirements: string | null } | null>(null);
  const [msg, setMsg] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadSiteRequirements()
      .then((all) => setState(all[siteId] ?? { required_documents: [], requirements: null }))
      .catch(() => setMsg({ kind: "error", text: "Couldn't load requirements." }));
  }, [siteId]);

  if (!state) return msg ? <Notice kind="error">{msg.text}</Notice> : <Loading />;

  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const docs = DOC_KINDS.map((k) => k.value).filter((k) => f.get(`doc-${k}`) === "on");
    setBusy(true);
    try {
      await saveSiteRequirements(siteId, docs, String(f.get("requirements") ?? "").trim() || null);
      setMsg({ kind: "info", text: "Saved. The rota's officer picker now checks these." });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Couldn't save." });
    }
    setBusy(false);
  }

  return (
    <Panel title="Shift requirements">
      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="text-caption text-ink">Officers must hold a verified, in-date…</legend>
          <p className="text-micro text-stone mt-1">An SIA licence is always required. Officers missing any of these are greyed out when offering shifts here.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {DOC_KINDS.filter((k) => k.value !== "sia_licence" && k.value !== "other").map((k) => (
              <label key={k.value} className="text-caption text-ink flex items-center gap-3">
                <input type="checkbox" name={`doc-${k.value}`} defaultChecked={state.required_documents.includes(k.value)} className="accent-electric-blue size-5" />
                {k.label}
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea label="Other requirements (dress code, skills, languages…)" id="req-text" name="requirements" rows={4} defaultValue={state.requirements ?? ""} />
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <PortalButton type="submit" disabled={busy}>
          Save requirements
        </PortalButton>
      </form>
    </Panel>
  );
}
