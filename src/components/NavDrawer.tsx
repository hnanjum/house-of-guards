import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Services" },
  { href: "/careers", label: "Careers" },
  { href: "/policies", label: "Our Policies" },
  { href: "/gallery", label: "Gallery" },
];

/**
 * Isolated interactive island: mobile nav drawer. Mirrors the desktop
 * nav exactly (same six links + the Get a Quote CTA).
 *
 * The trigger is a genuine hamburger icon now (three bars that morph
 * into an X on open), not plain text — the header used to be Guard
 * Green, where a bordered white-text button read fine; on the new
 * white header, an icon reads cleaner and is what the brief asks for.
 * Built from three `<motion.span>` bars rather than a static SVG
 * because the morph itself needs Framer Motion state, which an Astro
 * icon component can't drive from inside a React island.
 *
 * Full-height panel slide-in, a staggered fade/slide reveal on the
 * link list once the panel arrives, and an expo-style ease-out on the
 * panel itself (steeper deceleration than a generic material curve) —
 * closer to what higher-end sites use for a full-height sidebar than
 * an instant/linear slide. Every animated value has a reduced-motion
 * fallback (duration 0, no stagger, no offset).
 */
export default function NavDrawer() {
  const [open, setOpen] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const premiumEase = [0.16, 1, 0.3, 1] as const;

  const slideTransition = shouldReduceMotion
    ? { duration: 0 }
    : { type: "tween" as const, duration: 0.45, ease: premiumEase };

  const fadeTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.3 };

  const barTransition = shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: premiumEase };

  const listVariants = {
    hidden: {},
    visible: {
      transition: shouldReduceMotion ? {} : { staggerChildren: 0.06, delayChildren: 0.25 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: shouldReduceMotion ? 0 : 20 },
    visible: {
      opacity: 1,
      x: 0,
      transition: shouldReduceMotion ? { duration: 0 } : { duration: 0.5, ease: premiumEase },
    },
  };

  const barClass = "bg-ink absolute left-0 h-[1.5px] w-6 transition-colors duration-200 ease-out";

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="nav-drawer-panel"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="group flex h-11 w-11 items-center justify-center"
      >
        <span className="relative block h-6 w-6 group-hover:opacity-70">
          <motion.span
            className={barClass}
            style={{ top: "25%" }}
            animate={open ? { y: 6, rotate: 45 } : { y: 0, rotate: 0 }}
            transition={barTransition}
          />
          <motion.span
            className={barClass}
            style={{ top: "50%", marginTop: "-0.75px" }}
            animate={open ? { opacity: 0, x: 8 } : { opacity: 1, x: 0 }}
            transition={barTransition}
          />
          <motion.span
            className={barClass}
            style={{ bottom: "25%" }}
            animate={open ? { y: -6, rotate: -45 } : { y: 0, rotate: 0 }}
            transition={barTransition}
          />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="bg-ink/40 fixed inset-0 z-40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fadeTransition}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <motion.nav
              id="nav-drawer-panel"
              className="border-hairline bg-paper fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={slideTransition}
              aria-label="Main navigation"
            >
              <div className="border-hairline flex items-center justify-between border-b px-6 py-5">
                <span className="text-wordmark text-ink">House of Guards</span>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="group relative flex h-11 w-11 items-center justify-center"
                >
                  <span className="relative block h-4 w-4 group-hover:opacity-70">
                    <span className="bg-ink absolute top-1/2 left-1/2 h-[1.5px] w-5 -translate-x-1/2 -translate-y-1/2 rotate-45" />
                    <span className="bg-ink absolute top-1/2 left-1/2 h-[1.5px] w-5 -translate-x-1/2 -translate-y-1/2 -rotate-45" />
                  </span>
                </button>
              </div>

              {/* hover:border-guard-green-secondary — non-text accent on Paper, ~6.36:1, clears even the 4.5:1 normal-text floor (see global.css's Guard Green Secondary comment); same pairing as the desktop NavLink's own active/hover underline. */}
              <motion.ul
                className="divide-hairline flex-1 divide-y overflow-y-auto"
                variants={listVariants}
                initial="hidden"
                animate="visible"
              >
                {LINKS.map((link) => (
                  <motion.li key={link.href} variants={itemVariants}>
                    <a
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="text-ink text-body block border-l-2 border-transparent px-6 py-4 transition-colors duration-200 ease-out hover:border-guard-green-secondary"
                    >
                      {link.label}
                    </a>
                  </motion.li>
                ))}
              </motion.ul>

              <div className="px-6 py-6">
                <a
                  href="/contact"
                  onClick={() => setOpen(false)}
                  className="bg-guard-green-secondary text-paper hover:bg-guard-green-deep inline-flex w-full items-center justify-center rounded-none px-6 py-3 text-caption transition-colors duration-200 ease-out"
                >
                  Get a Quote
                </a>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
