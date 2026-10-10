import type { SVGProps } from "react";

/**
 * Navigation/utility glyphs for the admin dashboard. Plain 24px line
 * pictograms in the same family as the site's functional icons
 * (Phone/Email/Chevron: round caps, 1.75 stroke, currentColor). Each has
 * its own silhouette; no shield or tick motif anywhere (hard rule).
 */
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

type P = SVGProps<SVGSVGElement>;

export const IconOverview = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="9" />
    <rect x="14" y="3" width="7" height="5" />
    <rect x="14" y="12" width="7" height="9" />
    <rect x="3" y="16" width="7" height="5" />
  </svg>
);

export const IconCalendar = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="16" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const IconPin = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

export const IconPeople = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
    <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2" />
  </svg>
);

export const IconClock = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3.5 2" />
  </svg>
);

export const IconBuilding = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 21V5l8-2v18M12 8h8v13M4 21h17" />
    <path d="M7.5 8h1M7.5 12h1M7.5 16h1M15.5 12h1M15.5 16h1" />
  </svg>
);

export const IconUser = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4.2 4.1-6.5 8-6.5s7 2.3 8 6.5" />
  </svg>
);

export const IconSearch = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconMenu = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);

export const IconExit = (p: P) => (
  <svg {...base} {...p}>
    <path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />
  </svg>
);

/* ---------- officer operations ---------- */

/** Alarm bell (panic, alerts). */
export const IconBell = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);

/** A route through points (patrol). */
export const IconRoute = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="6" r="2.2" />
    <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
  </svg>
);

/** Open book (occurrence log). */
export const IconBook = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 6.5C10.3 5 7.8 4.5 4 4.5v14c3.8 0 6.3.5 8 2 1.7-1.5 4.2-2 8-2v-14c-3.8 0-6.3.5-8 2Z" />
    <path d="M12 6.5v14" />
  </svg>
);

/** Speech bubble (messages). */
export const IconMessage = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 5h16v11H9l-5 4V5Z" />
  </svg>
);

/** Folded document (documents, policies). */
export const IconDoc = (p: P) => (
  <svg {...base} {...p}>
    <path d="M6 3h8l4 4v14H6V3Z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </svg>
);

/** Clipboard with lines (checklists — boxes, never ticks). */
export const IconClipboard = (p: P) => (
  <svg {...base} {...p}>
    <rect x="5" y="4.5" width="14" height="17" />
    <path d="M9 3h6v3H9zM8.5 11h1.5M12.5 11h3M8.5 15.5h1.5M12.5 15.5h3" />
  </svg>
);

/** Flag on a pole (incident report). */
export const IconFlag = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
  </svg>
);

export const IconMore = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="5" cy="12" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="19" cy="12" r="1.2" />
  </svg>
);

export const IconMic = (p: P) => (
  <svg {...base} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
  </svg>
);

export const IconCamera = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 8h4l2-3h6l2 3h4v12H3V8Z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </svg>
);

/** QR-style corner marks (scan). */
export const IconScan = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    <path d="M8 12h8" />
  </svg>
);

export const IconKey = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 8-8M16 7l2.5 2.5M14 9l2 2" />
  </svg>
);

/** Banknote (payslips). */
export const IconNote = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="6" width="18" height="12" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6.5 9.5v5M17.5 9.5v5" />
  </svg>
);

/** Plus inside a calendar (extra shifts). */
export const IconCalendarPlus = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="16" />
    <path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" />
  </svg>
);

/** Heart-rate line (welfare check-ins). */
export const IconPulse = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 12h4l2-5 4 10 2-5h6" />
  </svg>
);
