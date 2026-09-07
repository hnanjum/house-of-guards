# House of Guards

Marketing website for House of Guards — a UK-based physical security company
providing manned guarding, event security, close protection, and mobile
patrols for corporate and high-net-worth clients.

Built with [Astro](https://astro.build) (static output), Tailwind CSS,
GSAP + ScrollTrigger, [Lenis](https://lenis.darkroom.engineering/) for
smooth scrolling, and isolated [React](https://react.dev) +
[Framer Motion](https://www.framer.com/motion/) islands for the nav drawer
and contact form. Deployed to **Cloudflare Workers** using native static
assets (not Cloudflare Pages).

## Project structure

```text
/
├── public/                  # Static files copied as-is to the build output
│   ├── .assetsignore        # Tells Wrangler which files not to upload
│   ├── favicon.ico
│   └── favicon.svg
├── src/
│   ├── components/          # React islands (client:* only, never whole-page)
│   │   ├── ContactForm.tsx
│   │   └── NavDrawer.tsx
│   ├── layouts/
│   │   └── BaseLayout.astro # <html> shell, View Transitions, Lenis init
│   ├── lib/
│   │   ├── smoothScroll.ts  # Lenis + GSAP ticker wiring
│   │   └── scrollReveal.ts  # GSAP/ScrollTrigger reveal-on-scroll helper
│   ├── pages/
│   │   ├── index.astro
│   │   └── 404.astro
│   └── styles/
│       └── global.css       # Tailwind import + custom design tokens
├── astro.config.mjs
├── wrangler.jsonc            # Cloudflare Workers (static assets) config
└── package.json
```

## Local development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build
```

Output goes to `dist/`. `npm run deploy` (`wrangler deploy`) reads from
`dist/` as configured in `wrangler.jsonc`, so build before deploying
manually:

```bash
npm run build
npm run deploy
```

You generally won't need to run `npm run deploy` yourself, though — see
below.

## Deploying via Cloudflare Workers Builds (recommended)

This project is set up for **Cloudflare Workers with native static
assets**, which is Cloudflare's current recommendation for new static
sites (Workers now has full feature parity with Pages for static hosting,
plus a simpler mental model going forward). Once connected to GitHub via
**Workers Builds**, every push triggers an automatic build and deploy —
no manual `wrangler deploy` needed after initial setup.

### 1. Push this repo to GitHub

```bash
git remote add origin https://github.com/<your-username>/house-of-guards.git
git branch -M main
git push -u origin main
```

(Create the empty GitHub repo first at https://github.com/new — don't
initialize it with a README/license/gitignore, since this repo already
has all of those.)

### 2. Connect the repo to Cloudflare via Workers Builds

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com/) →
   **Compute (Workers)** → **Workers & Pages**.
2. Click **Create** → **Workers** → **Import a repository** (or, from an
   existing Worker, go to its **Settings → Build** tab and connect a
   repository).
3. Authorize Cloudflare's GitHub App and select the `house-of-guards`
   repository.
4. Cloudflare will detect this is an Astro project. Confirm/set:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy` (Cloudflare may fill this
     in automatically once it detects `wrangler.jsonc`)
   - **Root directory:** `/` (repo root)
5. Click **Save and Deploy**.

From this point on, **every push to the connected branch (e.g. `main`)
automatically triggers a Workers Build**, which runs `npm run build`,
then deploys the result via Wrangler — no local `wrangler deploy` step
required. Pull requests / non-production branches can optionally get
their own preview deployments depending on how you configure branch
rules in the Worker's **Settings → Build** tab.

### 3. Find your live preview URL

- After the first successful build, go to the Worker's page in the
  Cloudflare dashboard (**Workers & Pages → house-of-guards**).
- The **default `workers.dev` URL** is shown at the top of the Worker's
  **Overview** tab, in the form:

  ```text
  https://house-of-guards.<your-subdomain>.workers.dev
  ```

- Each build also appears under the **Deployments** tab, where you can
  view build logs and, for non-production branches, a per-deployment
  preview URL.
- To use a custom domain instead, go to **Settings → Domains & Routes**
  on the Worker and add a custom domain or route.

## Notes

- Tailwind is configured with **no default color palette** — all of
  Tailwind's built-in colors are reset in `src/styles/global.css`
  (`--color-*: initial` inside the `@theme` block). Add House of
  Guards' brand color tokens there before using any `bg-*`/`text-*`/
  `border-*` utilities.
- GSAP, ScrollTrigger, and Lenis are wired together in
  `src/lib/smoothScroll.ts` and re-initialized on every View
  Transitions navigation (`astro:page-load`).
- React + Framer Motion are scoped to two isolated islands
  (`NavDrawer`, `ContactForm`) — they are not used for whole-page
  animation, which stays in GSAP/CSS.
