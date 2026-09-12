import retailPhoto from "../assets/sectors/retail.png";
import distributionPhoto from "../assets/sectors/distribution.png";
import corporatePhoto from "../assets/sectors/corporate.png";
import eventsPhoto from "../assets/sectors/events.png";
import healthcarePhoto from "../assets/sectors/healthcare.png";
import educationPhoto from "../assets/sectors/education.png";

/**
 * Single source of truth for sector content — shared by `SectorsGrid.astro`
 * (the homepage tab explainer) and `src/pages/sectors/[slug].astro` (the six
 * detail pages), so the two never drift out of sync. This is a straight
 * extraction of the array that used to live inline in `SectorsGrid.astro` —
 * no copy changed, no new sectors added.
 */

export type SectorFill = "electric-blue" | "magenta";

export interface Sector {
  slug: string;
  name: string;
  caption: string;
  headline: string;
  blurb: string;
  photo: ImageMetadata;
  alt: string;
  /** Undefined = plain Surface Alt panel/card (Corporate, Education). Set on
   * the other four (Retail, Distribution, Events, Healthcare) — see
   * `SectorsGrid.astro`'s own PANEL FILL comment for the fixed sequence and
   * reasoning. Drives background fill choices on both the homepage tab panel
   * and this sector's own detail-page hero tile — not a per-sector thematic
   * pick, a fixed positional sequence (see that comment for why). */
  fill?: SectorFill;
}

export const SECTORS: Sector[] = [
  {
    slug: "retail",
    name: "Retail",
    caption: "Retail security",
    headline: "Protecting stock, staff, and footfall",
    blurb:
      "Uniformed and covert officers who understand retail environments — deterring theft, managing difficult incidents calmly, and supporting your team through busy trading periods. Visible where it reassures customers, discreet where it doesn't.",
    photo: retailPhoto,
    alt: "A House of Guards officer, back to camera, standing watch on a busy shopping street outside retail storefronts.",
    fill: "magenta",
  },
  {
    slug: "distribution",
    name: "Distribution",
    caption: "Distribution & logistics",
    headline: "Securing sites that never stop moving",
    blurb:
      "Access control, vehicle checks, and perimeter patrols for warehouses and distribution centres where stock, vehicles, and shift patterns are constantly in motion. Officers trained to work alongside your operations, not around them.",
    photo: distributionPhoto,
    alt: "A House of Guards officer in a protective vest standing at a distribution yard, with two branded lorries parked at loading bays behind him.",
    fill: "electric-blue",
  },
  {
    slug: "corporate",
    name: "Corporate",
    caption: "Corporate security",
    headline: "A professional presence at reception and beyond",
    blurb:
      "Front-of-house officers who represent your brand as well as protect it — managing access, visitors, and incidents with the same discretion your clients expect from every other part of the building.",
    photo: corporatePhoto,
    alt: "A House of Guards officer standing beside security turnstiles in a corporate office lobby, with a receptionist at the front desk behind him.",
  },
  {
    slug: "events",
    name: "Events",
    caption: "Event security",
    headline: "Crowd management from arrival to close",
    blurb:
      "SIA-licensed teams for corporate functions, private events, and public gatherings — planning access flow and crowd safety before doors open, then managing it calmly throughout.",
    photo: eventsPhoto,
    alt: "A House of Guards officer wearing a hi-vis armband, standing beside a crowd barrier as a large crowd gathers outside a stadium.",
    fill: "electric-blue",
  },
  {
    slug: "healthcare",
    name: "Healthcare",
    caption: "Healthcare security",
    headline: "Calm, considered security in sensitive settings",
    blurb:
      "Officers trained to work within clinical environments — supporting staff, managing visitors, and de-escalating incidents without adding to the stress of an already difficult setting.",
    photo: healthcarePhoto,
    alt: "A House of Guards officer standing at a hospital reception desk, with a corridor leading toward the outpatients department behind him.",
    fill: "magenta",
  },
  {
    slug: "education",
    name: "Education",
    caption: "Education security",
    headline: "Safeguarding campuses, staff, and students",
    blurb:
      "Site security for schools, colleges, and universities — from daily access management to event cover — delivered by officers who understand the specific duty of care an education setting requires.",
    photo: educationPhoto,
    alt: "A House of Guards officer speaking with a visitor at a school's main entrance gate, with the school building behind them.",
  },
];
