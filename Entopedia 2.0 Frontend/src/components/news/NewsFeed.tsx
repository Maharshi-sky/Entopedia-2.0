"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Thumbnail } from "@/components/ui/Thumbnail";
import {
  categories,
  categoryTone,
  type Article,
  type CategoryFilter,
} from "./articles";

// Shortcut buttons; every category is still in the dropdown.
const quickFilters = categories.slice(0, 5);

function ArticleRow({ article }: { article: Article }) {
  return (
    <article className="flex overflow-hidden rounded-xl border border-line bg-white">
      {/* Image keeps a fixed share of the row and stretches to its full height. */}
      <div className="relative min-h-32 w-[30%] shrink-0 sm:w-[22%]">
        <Thumbnail
          src={article.image}
          alt=""
          sizes="(min-width: 640px) 22vw, 30vw"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={categoryTone[article.category]} pill>
            {article.category}
          </Badge>
          <span className="text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
            {article.source}
          </span>
        </div>
        <h2 className="mt-2 text-[1.0625rem] leading-snug font-semibold text-ink">
          {article.title}
        </h2>
        <p className=" text-xs text-gray-600">{article.summary}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between  ">
          <span className="text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
            {article.time}
          </span>
          <a
            href="#"
            className="flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-[0.8125rem] font-bold tracking-wider text-white uppercase transition-colors hover:bg-brand/90"
          >
            Read analysis
            <ChevronRight className="size-3.5" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function NewsFeed({ articles }: { articles: Article[] }) {
  const [active, setActive] = useState<CategoryFilter>("All News");
  const shown =
    active === "All News" ? articles : articles.filter((a) => a.category === active);

  return (
    <>
      <div className="flex items-center gap-3">
        <div
          role="tablist"
          aria-label="News category"
          className="scrollbar-none flex min-w-0 gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1.5"
        >
          {quickFilters.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === active}
              onClick={() => setActive(c)}
              className={`shrink-0 rounded-lg px-3.5 py-2 text-[0.9375rem] transition-colors ${
                c === active
                  ? "bg-brand font-semibold text-white"
                  : "text-gray-600 hover:text-ink"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Full list; the buttons above are just the common shortcuts. */}
        <div className="relative ml-auto shrink-0">
          <select
            aria-label="Filter news"
            value={active}
            onChange={(e) => setActive(e.target.value as CategoryFilter)}
            className="cursor-pointer appearance-none rounded-lg border border-line bg-white py-2 pr-8 pl-3 text-[0.9375rem] text-ink outline-none focus:border-brand"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink" />
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="space-y-3">
          {shown.map((a) => (
            <ArticleRow key={a.title} article={a} />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line py-16 text-center text-[0.9375rem] text-gray-500">
          No news in {active} yet.
        </p>
      )}
    </>
  );
}
