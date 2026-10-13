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
 * The phone number (07414 492363, confirmed by the owner 2026-10-13)
 * is still written out in each file that shows it, not kept here.
 */
export const CONTACT_EMAIL = "info@harleygarrison.co.uk";
