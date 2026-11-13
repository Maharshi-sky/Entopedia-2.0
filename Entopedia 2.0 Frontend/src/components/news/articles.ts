import type { BadgeTone } from "@/components/ui/Badge";
import type { Category } from "@/data/news";

// The news items themselves live in the data store (src/data/news.ts) and
// reach components as props; this file only holds how categories look.
export { categories, type Article, type Category, type CategoryFilter } from "@/data/news";

export const categoryTone: Record<Category, BadgeTone> = {
  Industry: "green",
  Science: "indigo",
  Technology: "red",
  Product: "amber",
  Regulatory: "red",
  Safety: "red",
  Disease: "red",
  Interviews: "indigo",
  "People & Company": "green",
};
