import { useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY } from "../data/contact";

/**
 * Cloudflare Turnstile spam check for the website forms (2026-10-13).
 * "interaction-only": invisible for almost everyone; a visitor only sees a
 * small box if Cloudflare wants them to tick it. The widget adds a hidden
 * `cf-turnstile-response` field to the surrounding <form>, which the forms
 * already send whole, and worker/forms.ts verifies it with the secret key.
 *
 * Renders nothing until TURNSTILE_SITE_KEY is set. Bump `resetKey` after
 * every submit: a token can only be used once.
 */

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function Turnstile({ resetKey = 0 }: { resetKey?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !box.current || widgetId.current) return;
        widgetId.current = api.render(box.current, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: "interaction-only",
          theme: "light",
          size: "flexible",
        });
      })
      .catch(() => {
        /* Script blocked: the server will reject the submit and the form shows its error. */
      });
    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey && widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="mt-4 empty:mt-0" />;
}
