import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/portalSupabase";

/**
 * Offline support for the officers app.
 *
 * OUTBOX — every record an officer creates on shift (clock in/out,
 * patrol scans, log entries, check-ins, checklists, incident reports and
 * their photos) goes through `send()`. If the phone has signal it is
 * written straight away. If not, it is saved on the phone (IndexedDB,
 * including any photo/video) and sent automatically when signal
 * returns, marked `offline` so the database keeps the phone's own time
 * for it (only if that time is in the past and under 24 hours old) and
 * the office can see it arrived late. Every record carries an id made on
 * the phone, so a retry after a dropped connection can never create a
 * duplicate.
 *
 * CACHE — the last copy of the officer's shifts, site instructions and
 * similar reference data is kept in localStorage so the app still shows
 * them with no signal.
 */

export interface OutboxFile {
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
}

export interface OutboxItem {
  id: string;
  /** What to show the officer while it waits, e.g. "Clock in · Depot". */
  label: string;
  kind: "insert" | "rpc";
  /** Table (insert) or function name (rpc). */
  target: string;
  payload: Record<string, unknown>;
  /** Payload key set to true when the item is sent late. */
  offlineKey?: string;
  files?: OutboxFile[];
  created_at: string;
  /** Set when the server refused it (not a connection problem). */
  error?: string;
  /** Kind of record, for showing pending items in the right place. */
  meta?: Record<string, unknown>;
}

const DB_NAME = "hg-officers";
const STORE = "outbox";
const CHANGED = "hg-outbox-changed";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function listOutbox(): Promise<OutboxItem[]> {
  try {
    const all = (await tx("readonly", (s) => s.getAll())) as OutboxItem[];
    return all.sort((a, b) => a.created_at.localeCompare(b.created_at));
  } catch {
    return [];
  }
}

const notify = () => window.dispatchEvent(new Event(CHANGED));

async function put(item: OutboxItem) {
  await tx("readwrite", (s) => s.put(item));
  notify();
}

export async function discard(id: string) {
  await tx("readwrite", (s) => s.delete(id));
  notify();
}

/** A failed request that never reached the server (no signal, timeout). */
export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const e = err as { message?: string; code?: string; name?: string } | null;
  const msg = `${e?.name ?? ""} ${e?.message ?? ""}`;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|aborted/i.test(msg);
}

class ServerError extends Error {}

async function uploadFile(f: OutboxFile) {
  const { error } = await supabase.storage.from(f.bucket).upload(f.path, f.blob, { contentType: f.contentType, upsert: false });
  if (!error) return;
  // Already uploaded by an earlier attempt.
  if (/already exists|duplicate/i.test(error.message)) return;
  if (isNetworkError(error)) throw error;
  throw new ServerError(error.message);
}

async function perform(item: OutboxItem, late: boolean): Promise<unknown> {
  for (const f of item.files ?? []) await uploadFile(f);
  const payload = late && item.offlineKey ? { ...item.payload, [item.offlineKey]: true } : item.payload;
  if (item.kind === "insert") {
    const { error } = await supabase.from(item.target).insert(payload);
    if (!error) return null;
    if (error.code === "23505") return null; // sent before; the record exists
    if (isNetworkError(error)) throw error;
    throw new ServerError(error.message);
  }
  const { data, error } = await supabase.rpc(item.target, payload);
  if (!error) return data;
  if (isNetworkError(error)) throw error;
  throw new ServerError(error.message);
}

export type SendResult<T = unknown> = { queued: false; data: T } | { queued: true };

/**
 * Send now, or keep it on the phone if there's no signal. Server
 * refusals (e.g. the shift was cancelled) are thrown, not queued.
 */
export async function send<T = unknown>(item: Omit<OutboxItem, "created_at">): Promise<SendResult<T>> {
  const full: OutboxItem = { ...item, created_at: new Date().toISOString() };
  try {
    const data = (await perform(full, false)) as T;
    return { queued: false, data };
  } catch (err) {
    if (err instanceof ServerError || !isNetworkError(err)) throw err;
    await put(full);
    return { queued: true };
  }
}

let flushing: Promise<void> | null = null;

/** Send everything waiting, oldest first. Stops at the first connection failure. */
export function flushOutbox(): Promise<void> {
  if (flushing) return flushing;
  flushing = (async () => {
    for (const item of await listOutbox()) {
      if (item.error) continue;
      try {
        await perform(item, true);
        await discard(item.id);
      } catch (err) {
        if (isNetworkError(err)) break;
        await put({ ...item, error: err instanceof Error ? err.message : "Refused by the server" });
      }
    }
  })().finally(() => {
    flushing = null;
    notify();
  });
  return flushing;
}

/** Outbox state for the UI, flushing on reconnect and every 30 seconds. */
export function useOutbox(onSynced?: () => void) {
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  const reload = useCallback(async () => setItems(await listOutbox()), []);

  useEffect(() => {
    reload();
    let before = 0;
    const onChange = async () => {
      const next = await listOutbox();
      if (next.length < before) onSynced?.();
      before = next.length;
      setItems(next);
    };
    const tryFlush = () => {
      if (navigator.onLine) flushOutbox();
    };
    const onOnline = () => {
      setOnline(true);
      tryFlush();
    };
    const onOffline = () => setOnline(false);
    listOutbox().then((l) => (before = l.length));
    window.addEventListener(CHANGED, onChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    tryFlush();
    const t = setInterval(tryFlush, 30_000);
    return () => {
      window.removeEventListener(CHANGED, onChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(t);
    };
  }, [reload, onSynced]);

  return { items, waiting: items.filter((i) => !i.error), failed: items.filter((i) => i.error), online, flush: flushOutbox, discard };
}

/* ---------- read cache ---------- */

const cacheKey = (key: string) => `hg.cache.${key}`;

/** Load fresh data, saving a copy; with no signal, return the saved copy. */
export async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  try {
    const data = await load();
    try {
      localStorage.setItem(cacheKey(key), JSON.stringify({ at: Date.now(), data }));
    } catch {
      /* storage full */
    }
    return data;
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    const saved = localStorage.getItem(cacheKey(key));
    if (saved) return (JSON.parse(saved) as { data: T }).data;
    throw err;
  }
}

/** Remove everything this app saved on the phone (on sign-out). */
export async function clearDevice() {
  for (const k of Object.keys(localStorage)) if (k.startsWith("hg.")) localStorage.removeItem(k);
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {
    /* ignore */
  }
}
