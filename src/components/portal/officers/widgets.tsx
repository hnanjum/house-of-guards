import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { Field, Notice, PortalButton } from "../ui";
import { IconCamera, IconMic } from "../admin/icons";

/**
 * Interactive pieces used on shift: the QR checkpoint scanner, the
 * clock-in selfie, voice dictation for reports, the hold-to-send panic
 * control, and a simple tab strip.
 */

/* ---------- QR scanner ---------- */

/** Checkpoint stickers encode "HGCP:<code>"; a bare code is accepted too. */
export function parseCheckpointCode(text: string) {
  const t = text.trim();
  const m = t.match(/^HGCP:([0-9a-f]{32})$/i);
  return (m ? m[1] : t).toLowerCase();
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

export function QrScanner({ onCode, busy }: { onCode: (code: string) => void; busy?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const last = useRef<{ code: string; at: number } | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer: number | undefined;

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setProblem("This phone's browser can't open the camera here. Type the code printed under the QR sticker instead.");
        setManual(true);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setProblem("The camera couldn't be opened. Allow camera access for this site, or type the code printed under the sticker.");
        setManual(true);
        return;
      }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});

      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      let detector: Detector | null = null;
      if (Native) {
        try {
          detector = new Native({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      const tick = async () => {
        if (stopped) return;
        const v = video.current;
        if (v && v.readyState >= 2 && !busyRef.current) {
          let found: string | null = null;
          try {
            if (detector) {
              const codes = await detector.detect(v);
              found = codes[0]?.rawValue ?? null;
            } else if (jsQR && ctx) {
              const w = Math.min(640, v.videoWidth);
              const h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
            }
          } catch {
            found = null;
          }
          if (found) {
            const now = Date.now();
            if (!last.current || last.current.code !== found || now - last.current.at > 4000) {
              last.current = { code: found, at: now };
              navigator.vibrate?.(80);
              onCodeRef.current(parseCheckpointCode(found));
            }
          }
        }
        timer = window.setTimeout(tick, 250);
      };
      tick();
    })();

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function submitManual(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    if (code.trim()) onCode(parseCheckpointCode(code));
    e.currentTarget.reset();
  }

  return (
    <div className="space-y-4">
      {!problem && (
        <div className="bg-ink relative aspect-square w-full max-w-sm overflow-hidden">
          <video ref={video} playsInline muted className="size-full object-cover" aria-label="Camera view for scanning checkpoint codes" />
          <div className="border-paper/80 pointer-events-none absolute inset-[18%] border-2" aria-hidden="true" />
        </div>
      )}
      {problem && <Notice kind="error">{problem}</Notice>}
      {manual ? (
        <form onSubmit={submitManual} className="flex max-w-sm items-end gap-3">
          <div className="flex-1">
            <Field label="Code under the sticker" id="cp-code" name="code" autoComplete="off" autoCapitalize="off" spellCheck={false} />
          </div>
          <PortalButton type="submit" disabled={busy}>
            Record
          </PortalButton>
        </form>
      ) : (
        <button type="button" onClick={() => setManual(true)} className="text-caption text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink">
          Sticker won't scan? Type its code
        </button>
      )}
    </div>
  );
}

/* ---------- selfie ---------- */

export function SelfieCapture({ value, onChange, label = "Take a selfie" }: { value: Blob | null; onChange: (b: Blob | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return setPreview(null);
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  return (
    <div className="flex items-center gap-5">
      <div className="bg-surface-alt border-hairline flex size-24 shrink-0 items-center justify-center overflow-hidden border">
        {preview ? <img src={preview} alt="Your selfie" className="size-full object-cover" /> : <IconCamera width={28} height={28} className="text-stone" />}
      </div>
      <div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          id="selfie-input"
          onChange={(e) => {
            onChange(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <PortalButton tone="quiet" onClick={() => input.current?.click()} className="gap-2">
          <IconCamera width={18} height={18} />
          {value ? "Retake" : label}
        </PortalButton>
        <p className="text-micro text-stone mt-2">Your face, at the site. The office sees it with your clock record.</p>
      </div>
    </div>
  );
}

/* ---------- dictation ---------- */

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

function recognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Speak instead of typing. Hidden on browsers without speech recognition. */
export function DictateButton({ onText }: { onText: (text: string) => void }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const Ctor = recognitionCtor();

  useEffect(() => () => rec.current?.stop(), []);
  if (!Ctor) return null;

  function toggle() {
    if (on) {
      rec.current?.stop();
      return;
    }
    setError(null);
    const r = new Ctor!();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
      }
    };
    r.onerror = (e) => setError(e.error === "not-allowed" ? "Microphone access is blocked for this site." : "Dictation stopped. Try again.");
    r.onend = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        className={`text-caption inline-flex min-h-11 items-center gap-2 border px-4 ${on ? "border-ink bg-ink text-paper" : "border-ink/20 text-ink hover:border-ink"}`}
      >
        <IconMic width={18} height={18} />
        {on ? "Listening… tap to stop" : "Dictate"}
      </button>
      {error && <p className="text-micro text-stone mt-2">{error}</p>}
    </div>
  );
}

/** Append dictated text to a textarea's current value. */
export const appendText = (current: string, add: string) => (current.trim() ? `${current.replace(/\s+$/, "")} ${add}` : add);

/* ---------- hold to send ---------- */

/**
 * Press and hold for `ms` to fire (so a pocket or a stray tap can't send
 * a panic alert). Works with touch, mouse, and keyboard (hold Space or
 * Enter). A darker band rises while held.
 */
export function HoldButton({ onFire, ms = 2000, children, disabled }: { onFire: () => void; ms?: number; children: ReactNode; disabled?: boolean }) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | undefined>(undefined);
  const fired = useRef(false);

  const stop = () => {
    start.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    if (!fired.current) setProgress(0);
  };
  const begin = () => {
    if (disabled || start.current != null) return;
    fired.current = false;
    start.current = performance.now();
    const step = () => {
      if (start.current == null) return;
      const p = Math.min(1, (performance.now() - start.current) / ms);
      setProgress(p);
      if (p >= 1) {
        fired.current = true;
        start.current = null;
        navigator.vibrate?.([100, 60, 100]);
        onFire();
        setTimeout(() => setProgress(0), 600);
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        begin();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") stop();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="on-dark bg-magenta text-paper relative flex aspect-square w-full max-w-64 touch-none flex-col items-center justify-center overflow-hidden select-none disabled:opacity-50"
    >
      <span className="bg-ink/30 absolute inset-x-0 bottom-0" style={{ height: `${progress * 100}%` }} aria-hidden="true" />
      <span className="relative flex flex-col items-center">{children}</span>
    </button>
  );
}

/* ---------- tabs ---------- */

export function Tabs({ items, active }: { items: { href: string; key: string; label: string }[]; active: string }) {
  return (
    <nav aria-label="Sections" className="border-hairline bg-paper -mx-gutter overflow-x-auto border-b md:-mx-10">
      <ul className="flex min-w-max px-gutter md:px-10">
        {items.map((i) => {
          const on = i.key === active;
          return (
            <li key={i.key}>
              <a
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={`text-caption inline-flex min-h-12 items-center border-b-2 px-3 ${on ? "border-amber text-ink" : "text-stone hover:text-ink border-transparent"}`}
              >
                {i.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Segmented control for switching a view (period, filter). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="border-hairline flex flex-wrap border" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`text-caption min-h-11 px-3 sm:px-4 ${value === o.value ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-surface-alt"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
