/**
 * Sitewide contact details that more than one file needs. Introduced with
 * the Careers page (`src/pages/careers.astro` and `ApplicationForm.tsx`
 * both need the email address, one as page copy and one as the fallback
 * shown while no submission endpoint is wired up).
 *
 * `Header.astro`, `Footer.astro` and `ClosingCta.astro` still carry the
 * same address (and the phone number) as literal strings — they were left
 * untouched by that PR on purpose, to keep it scoped to the new page.
 * Pointing them at this file is a safe follow-up.
 *
 * No phone number lives here: the `01274 000 000` figure in those three
 * files is a known, unconfirmed placeholder, and putting it in a shared
 * source would make it easier to spread, not easier to fix.
 */
export const CONTACT_EMAIL = "info@houseofguards.co.uk";
