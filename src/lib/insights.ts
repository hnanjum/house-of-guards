import { getCollection, type CollectionEntry } from "astro:content";

export type Insight = CollectionEntry<"insights">;

/** Published articles, newest first. Drafts never reach the built site. */
export async function getInsights(): Promise<Insight[]> {
  const all = await getCollection("insights", ({ data }) => !data.draft);
  return all.sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

/** "13 October 2026" — UK format, fixed to London so builds don't shift dates. */
export const formatDate = (date: Date) =>
  date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });

/** Minutes to read at ~220 words per minute, never less than 1. */
export const readingMinutes = (body = "") => Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 220));
