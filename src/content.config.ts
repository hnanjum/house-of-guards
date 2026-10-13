import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * Insights (blog). One folder per article:
 *   src/content/insights/<slug>/index.md   (front matter + body)
 *   src/content/insights/<slug>/cover.jpg  (and any body images)
 * The folder name is the URL: /insights/<slug>/.
 * Written by the owner in the /editor/ (Sveltia CMS), which commits these
 * files to GitHub; keep the field names in sync with public/editor/config.yml.
 */
export const CATEGORIES = ["Security advice", "Sector guides", "Compliance", "Company news"] as const;

const insights = defineCollection({
  loader: glob({
    pattern: "*/index.md",
    base: "./src/content/insights",
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ""),
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      category: z.enum(CATEGORIES),
      cover: image(),
      coverAlt: z.string(),
      draft: z.boolean().default(false),
    }),
});

export const collections = { insights };
