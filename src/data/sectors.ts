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
  /**
   * Detail-page-only content — added (PR #43) as optional fields, left
   * UNSET on every sector at the time since the content draft they were
   * meant to come from still had unresolved `[[ADD REAL DETAIL]]` markers
   * despite its own "approved, ready for build" status line (flagged
   * rather than guessed at). Populated for real (PR #46) once a genuinely
   * resolved draft was verified — every marker checked gone, including the
   * Healthcare mental-health-crisis FAQ, before any of this was filled in.
   * Every detail-page section reading these fields still renders
   * conditionally, so a sector could in principle ship without them again
   * (e.g. a future seventh sector added before its own copy is ready)
   * without breaking anything. See `src/pages/sectors/[slug].astro` for
   * the conditional rendering and `src/lib/sectorFaqAccordion.ts` for the
   * FAQ interaction.
   */
  expandedDescription?: string;
  /** Plain bullet points — a real list, not a numbered sequence. */
  risks?: string[];
  /** The "how House of Guards addresses this" paragraph pairing with `risks`. */
  approach?: string;
  faqs?: { question: string; answer: string }[];
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
    expandedDescription:
      "Retail security sits at the intersection of theft prevention, customer safety, and brand experience — a uniformed presence that looks approachable rather than intimidating matters as much as the deterrent itself. House of Guards officers working retail environments are SIA-licensed and first-aid trained, and shift patterns are built around the store's actual footfall (weekend peaks, seasonal surges, late-night restocking) rather than a fixed package that doesn't flex.",
    risks: [
      "Shoplifting and organised retail crime, often targeting specific high-value categories",
      "Till/point-of-sale security during cash handling and close of business",
      "Aggressive or abusive customer incidents, particularly around returns/refunds",
      "Seasonal risk spikes (Christmas trading, sale periods) needing flexible cover",
      "Loss prevention that doesn't create a hostile shopping environment",
    ],
    approach:
      "Bespoke shift patterns mean cover scales up for known peak periods instead of running a flat rota all year. First-aid trained officers double as a safety resource during medical incidents on the shop floor, not just a security presence. Officers work across malls, individual shops, and general retail environments broadly.",
    faqs: [
      {
        question: "Do you provide security for a single event or seasonal period, or only long-term contracts?",
        answer:
          "Shift patterns are built around what the client actually needs — that can mean short seasonal cover as easily as an ongoing contract.",
      },
      {
        question: "Are your retail officers trained in de-escalation as well as physical deterrence?",
        answer: "Yes — officers are trained in de-escalation, not just physical deterrence.",
      },
      {
        question: "Can officers be briefed on specific high-theft product categories?",
        answer: "Yes, briefings can be tailored to a client's specific concerns.",
      },
    ],
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
    expandedDescription:
      "Distribution and warehouse sites carry a different risk profile from retail — large perimeters, high-value stock in transit, shift patterns that often run overnight, and multiple access points (loading bays, staff entrances, vehicle gates) that all need consistent control. House of Guards' overnight security service and bespoke shift patterns are built for exactly this kind of site, rather than a generic day-shift-only offering.",
    risks: [
      "Perimeter breaches and after-hours intrusion",
      "Stock loss during loading/unloading and internal pilferage",
      "Access control across multiple entry points (staff, visitors, HGV/vehicle traffic)",
      "Lone-working risk for warehouse staff during overnight shifts",
      "CCTV blind spots across large or irregularly shaped sites",
    ],
    approach:
      "Overnight security is a named service, not an add-on — officers are SIA-licensed and first-aid trained regardless of shift time. CCTV monitoring can be paired with physical patrols to cover blind spots a camera-only setup misses, and officers are equipped to manage vehicle and HGV access alongside pedestrian entry, not just one or the other.",
    faqs: [
      {
        question: "Can you cover 24/7 overnight sites without gaps between shift handovers?",
        answer: "Yes — a proper handover process runs between shifts as standard.",
      },
      {
        question: "Do you coordinate with existing CCTV systems or only provide your own?",
        answer:
          "Both — officers can work with a client's existing CCTV system or bring their own monitoring, depending on what the site needs.",
      },
      {
        question: "Can officers manage vehicle/HGV access as well as pedestrian entry?",
        answer: "Yes — officers are equipped to handle both.",
      },
    ],
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
    expandedDescription:
      "Corporate security is as much about first impressions as it is about protection — a reception-area or building-entrance officer is often the first person a visitor, client, or employee interacts with. House of Guards' emphasis on smart uniform presentation and clear reporting is built for environments where professionalism and discretion matter as much as physical presence.",
    risks: [
      "Unauthorised building access and visitor management",
      "Reception-area incidents, including disgruntled visitors or former employees",
      "Confidentiality around sensitive meetings, data, or high-profile visitors",
      "Balancing a welcoming front-of-house feel with genuine security control",
      "Multi-tenant buildings needing coordination across different companies",
    ],
    approach:
      "Officers are selected on skill and character as well as licensing, which matters disproportionately in front-of-house roles where tone and judgement are part of the job. Clear reporting gives corporate clients visibility into incidents and visitor logs on request, rather than a black box.",
    faqs: [
      {
        question: "Can officers be briefed on VIP or executive protocols for specific visitors?",
        answer:
          "Yes — this can be handled within the Corporate Security service itself; for more involved personal protection needs, our dedicated Close Protection service is also available.",
      },
      {
        question: "Do you provide access-control/visitor-log reporting as standard?",
        answer:
          "Reporting such as visitor logs and incident reports is available on request, tailored to what the client needs.",
      },
      {
        question: "Can staffing flex around business hours vs. out-of-hours building access?",
        answer: "Yes — shift patterns are built around the site's actual hours rather than a fixed package.",
      },
    ],
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
    expandedDescription:
      "Event security has to handle unpredictable crowd behaviour, entry/exit control, and often high-profile or high-density environments, all under time pressure — events don't have a second chance to get security right on the day. House of Guards' team draws on real experience across stadiums, marathons, and pub/club doors, which means officers have worked the specific pressure points of live events, not just static site security.",
    risks: [
      "Crowd control and capacity management",
      "Entry screening (tickets, prohibited items, ID checks for licensed venues)",
      "Medical incidents in high-density crowds",
      "Coordinating with event organisers, venue staff, and emergency services in real time",
      "Weather-dependent or outdoor-event-specific risks",
    ],
    approach:
      "First-aid trained officers matter directly here — event environments have a higher likelihood of medical incidents simply due to crowd size, and having that response built into the security team rather than a separate first-aid provider closes a common gap.",
    faqs: [
      {
        question: "Can you staff a one-off event as well as recurring event contracts?",
        answer: "Yes — shift patterns are built per event, not tied to long-term contracts only.",
      },
      {
        question: "Do your officers have door supervision / licensed premises experience?",
        answer: "Yes — pub and club door experience is part of the team's real background.",
      },
      {
        question: "How do you handle coordination with event organisers and emergency services on the day?",
        answer: "This is tailored to each event rather than a single fixed process, since events vary widely in scale and setup.",
      },
    ],
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
    expandedDescription:
      "Healthcare security has to operate within an environment built around patient care and dignity — a heavy-handed security presence can itself become a problem in a hospital, clinic, or care setting. House of Guards' first-aid trained officers are a genuine advantage here: security staff who understand basic medical response are better equipped to work alongside clinical teams rather than around them.",
    risks: [
      "Aggressive or distressed patients/visitors, including mental health crisis situations",
      "Restricted-area access control (wards, pharmacies, staff-only zones)",
      "Visitor management, particularly during high-traffic visiting hours",
      "Safeguarding considerations for vulnerable patients",
      "Balancing a calm, non-institutional feel with genuine access control",
    ],
    // Two constraints carried through verbatim from the content draft, not
    // paraphrased: (1) officers are available/ready for healthcare sites,
    // NOT described as having a healthcare track record — House of Guards
    // has no site experience in this sector yet; (2) see the mental-health
    // FAQ below for the general-not-specialised training distinction.
    approach:
      "First-aid training isn't just a differentiator here, it's directly relevant — officers can support rather than complicate a clinical incident. Officers work alongside a site's own clinical staff, handling the security side of an incident while medical staff lead the clinical response. House of Guards is available to support healthcare sites and ready to build a service around a client's specific needs, drawing on the same SIA-licensed, first-aid trained, DBS-checked standard applied across every sector.",
    faqs: [
      {
        question: "Are your officers trained to handle patients in mental health crisis?",
        answer:
          "Officers receive general de-escalation training, but not specialised mental-health-crisis training specifically — for sites with a particular need in this area, this is worth discussing directly so the right level of support can be arranged.",
      },
      {
        question: "Can you provide DBS-checked officers for healthcare settings?",
        answer: "Yes — DBS checks are already part of the standard SIA-licensed/DBS-checked offering.",
      },
      {
        question: "Do you coordinate with clinical staff during an incident, or operate separately?",
        answer:
          "Officers handle security separately alongside a site's own clinical staff, rather than acting as part of the clinical response itself.",
      },
    ],
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
    expandedDescription:
      "Education security covers everything from day-to-day access control on a school or campus site to event-specific cover for open days, exams, or graduation ceremonies. Officers working in education settings need a particular kind of judgement — visible enough to reassure parents and staff, approachable enough not to feel like a lockdown environment for students.",
    risks: [
      "Access control for large campuses with multiple entry points",
      "Visitor/parent management, especially around pick-up/drop-off times",
      "Safeguarding considerations around any adult presence on a school site",
      "Event-specific cover (open days, exams, graduations, prize-givings)",
      "Perimeter security for out-of-hours campus access",
    ],
    approach:
      "Diverse hiring on skill and character is particularly relevant here — schools need officers whose presence and tone genuinely fit an environment built around young people. Officers deployed to education sites undergo the same standard DBS check applied across every sector — there is no separate education-specific vetting process beyond this standard.",
    faqs: [
      {
        question: "Are officers DBS-checked for work on school/education sites?",
        answer: "Yes — DBS checks are part of the standard vetting process.",
      },
      {
        question: "Can you provide short-term cover for specific events like exams or open days?",
        answer: "Yes — shift patterns flex per event rather than requiring a long-term contract.",
      },
      {
        question: "Do you offer overnight/out-of-hours perimeter security for campuses during holidays?",
        answer: "Yes — this falls under the existing Overnight Security service.",
      },
    ],
  },
];
