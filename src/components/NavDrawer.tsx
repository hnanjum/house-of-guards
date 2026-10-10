import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CONTACT_EMAIL } from "../data/contact";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Services" },
  { href: "/careers", label: "Careers" },
  { href: "/policies", label: "Our Policies" },
  { href: "/gallery", label: "Gallery" },
];

/**
 * Mobile/tablet menu (below lg). Rebuilt on the owner's direct
 * instruction for a cleaner, more premium feel to match the black header:
 *
 * - Trigger: two white lines of unequal length (the shorter one widens
 *   on hover), not a generic three-bar icon.
 * - Opens as a full-screen Ink "curtain" that drops from the top
 *   (clip-path inset), rather than a white side drawer. It covers the
 *   info bar and header, so it carries its own logo + close row.
 * - Links are set large in the display serif, each rising out of its
 *   own mask on a short stagger; the current page carries an Amber dash
 *   (bare mark on Ink, ~9:1). Get a Quote (Amber fill, Ink text ~9.05:1)
 *   and the contact line fade in last.
 * - Escape closes; focus moves to the close button on open and back to
 *   the trigger on close; page scroll (including Lenis, via the
 *   "hg:scroll-lock" event in smoothScroll.ts) is locked while open.
 * - Reduced motion: every transition is instant, nothing slides.
 *
 * Text on Ink: white ~19.4:1, white at 70% ~9.6:1. Focus rings inside
 * the overlay are Paper (on-dark), since an Ink ring on Ink is invisible.
 */
export default function NavDrawer() {
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState("/");
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  const ease = [0.76, 0, 0.24, 1] as const; // in-out for the curtain
  const easeOut = [0.16, 1, 0.3, 1] as const; // expo-out for the links

  useEffect(() => {
    if (open) {
      setPath(window.location.pathname.replace(/\/$/, "") || "/");
      document.documentElement.style.overflow = "hidden";
      window.dispatchEvent(new CustomEvent("hg:scroll-lock", { detail: true }));
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", onKey);
      const t = window.setTimeout(() => closeRef.current?.focus(), reduce ? 0 : 350);
      wasOpen.current = true;
      return () => {
        window.removeEventListener("keydown", onKey);
        window.clearTimeout(t);
      };
    }
    if (wasOpen.current) {
      document.documentElement.style.overflow = "";
      window.dispatchEvent(new CustomEvent("hg:scroll-lock", { detail: false }));
      triggerRef.current?.focus();
    }
  }, [open, reduce]);

  const curtain = {
    hidden: { clipPath: "inset(0% 0% 100% 0%)" },
    visible: { clipPath: "inset(0% 0% 0% 0%)", transition: reduce ? { duration: 0 } : { duration: 0.7, ease } },
    exit: {
      clipPath: "inset(0% 0% 100% 0%)",
      transition: reduce ? { duration: 0 } : { duration: 0.55, ease, delay: 0.1 },
    },
  };

  const list = {
    hidden: {},
    visible: { transition: reduce ? {} : { staggerChildren: 0.06, delayChildren: 0.35 } },
    exit: { transition: reduce ? {} : { staggerChildren: 0.03, staggerDirection: -1 } },
  };

  const rise = {
    hidden: { y: reduce ? "0%" : "110%" },
    visible: { y: "0%", transition: reduce ? { duration: 0 } : { duration: 0.8, ease: easeOut } },
    exit: { y: reduce ? "0%" : "-110%", transition: reduce ? { duration: 0 } : { duration: 0.35, ease } },
  };

  const fade = (delay: number) => ({
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    visible: { opacity: 1, y: 0, transition: reduce ? { duration: 0 } : { duration: 0.6, ease: easeOut, delay } },
    exit: { opacity: 0, transition: reduce ? { duration: 0 } : { duration: 0.2 } },
  });

  const close = () => setOpen(false);

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="nav-drawer-panel"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="group flex h-11 w-11 items-center justify-end focus-visible:outline-paper"
      >
        <span className="flex w-7 flex-col items-end gap-[7px]">
          <span className="bg-paper block h-[1.5px] w-7" />
          <span className="bg-paper block h-[1.5px] w-4 transition-[width] duration-300 ease-out group-hover:w-7" />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id="nav-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className="on-dark bg-ink text-paper fixed inset-0 z-50 flex flex-col overflow-y-auto"
            variants={curtain}
            initial="hidden"
            animate="visible"
            exit="exit"
            data-lenis-prevent
          >
            <motion.div
              className="border-paper/10 flex items-center justify-between border-b px-gutter py-4 md:px-12"
              variants={fade(0.25)}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <a href="/" onClick={close} aria-label="Harley Garrison, home">
                <img src="/logo/logo-white.svg" alt="Harley Garrison" width="148" height="40" className="h-8 w-auto" />
              </a>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close menu"
                onClick={close}
                className="group relative flex h-11 w-11 items-center justify-center"
              >
                <span className="relative block h-5 w-5 transition-transform duration-500 ease-out group-hover:rotate-90">
                  <span className="bg-paper absolute top-1/2 left-1/2 h-[1.5px] w-6 -translate-x-1/2 -translate-y-1/2 rotate-45" />
                  <span className="bg-paper absolute top-1/2 left-1/2 h-[1.5px] w-6 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
                </span>
              </button>
            </motion.div>

            <nav aria-label="Main navigation" className="flex flex-1 flex-col px-gutter pt-8 pb-6 md:px-12">
              <motion.ul className="flex flex-col" variants={list} initial="hidden" animate="visible" exit="exit">
                {LINKS.map((link) => {
                  const current = path === link.href;
                  return (
                    <li key={link.href} className="border-paper/10 border-b">
                      <span className="block overflow-hidden">
                        <motion.a
                          href={link.href}
                          onClick={close}
                          aria-current={current ? "page" : undefined}
                          variants={rise}
                          className="text-h2 group flex items-center py-3 transition-colors duration-300 hover:text-paper/70"
                        >
                          <span
                            aria-hidden="true"
                            className={`bg-amber block h-0.5 transition-[width,margin] duration-500 ease-out ${current ? "mr-4 w-6" : "mr-0 w-0 group-hover:mr-4 group-hover:w-6"}`}
                          />
                          {link.label}
                        </motion.a>
                      </span>
                    </li>
                  );
                })}
              </motion.ul>

              <motion.div className="mt-auto pt-10" variants={fade(0.75)} initial="hidden" animate="visible" exit="exit">
                <a
                  href="/contact"
                  onClick={close}
                  className="bg-amber text-ink hover:brightness-90 text-caption inline-flex w-full items-center justify-center rounded-none px-6 py-4 transition-[filter] duration-200 ease-out"
                >
                  Get a Quote
                </a>
                <div className="text-caption text-paper/70 mt-6 flex flex-col gap-2 sm:flex-row sm:gap-8">
                  <a href="tel:+441274000000" className="hover:text-paper transition-colors duration-200">
                    01274 000 000
                  </a>
                  <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-paper transition-colors duration-200">
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
