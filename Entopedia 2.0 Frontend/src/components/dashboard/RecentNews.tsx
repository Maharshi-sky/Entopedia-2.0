"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Thumbnail } from "@/components/ui/Thumbnail";
import { Badge } from "@/components/ui/Badge";
import {
  categories,
  categoryTone,
  type Article,
  type CategoryFilter,
} from "@/components/news/articles";

function FeaturedArticle({ article }: { article: Article }) {
  return (
    <Link
      href="/news"
      className="group relative flex min-h-80 flex-col justify-end overflow-hidden rounded-xl bg-gray-300"
    >
      <div className="absolute inset-0">
        <Thumbnail
          src={article.image}
          alt=""
          sizes="(min-width: 1024px) 40vw, 100vw"
        />
      </div>
      <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/40 to-transparent" />
      <div className="relative p-5 text-white">
        <Badge tone="solid">{article.category}</Badge>
        <h3 className="mt-3 text-xl leading-snug font-semibold group-hover:underline">
          {article.title}
        </h3>
        <p className="mt-2 text-[0.9375rem] text-white/80">{article.summary}</p>
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className="font-semibold">{article.source}</span>
          <span className="text-white/70">{article.time}</span>
        </div>
      </div>
    </Link>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      href="/news"
      className="group flex gap-3 rounded-xl bg-[#f5f6f5] p-2.5 transition-colors hover:bg-[#eef0ef]"
    >
      {/* Fixed width; height stretches to match the text column beside it. */}
      <div className="relative min-h-20 w-20 shrink-0 self-stretch overflow-hidden rounded-lg">
        <Thumbnail src={article.image} alt="" sizes="80px" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 text-[0.9375rem] leading-snug font-semibold text-ink group-hover:underline">
          {article.title}
        </h3>
        <p className="mt-1 truncate text-xs text-gray-500">{article.summary}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Badge tone={categoryTone[article.category]} size="sm">
            {article.category}
          </Badge>
          <span className="truncate text-[0.8125rem] text-gray-500">
            {article.source} · {article.time}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function RecentNews({ articles }: { articles: Article[] }) {
  const [active, setActive] = useState<CategoryFilter>("All News");
  // The dashboard keeps to the latest few; /news shows everything.
  const latest = articles.slice(0, 8);
  const filtered =
    active === "All News"
      ? latest
      : latest.filter((a) => a.category === active);
  const [featured, ...rest] = filtered;

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-ink">
            Recent news intelligence
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Curated signals from monitored markets and sources
          </p>
        </div>
        <Link
          href="/news"
          className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand/90"
        >
          View all
          <ChevronRight className="size-3.5" />
        </Link>
      </div>

      <div
        role="tablist"
        aria-label="News category"
        className="scrollbar-none mt-4 flex gap-1 overflow-x-auto rounded-lg bg-[#f1f3f2] p-1"
      >
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={c === active}
            onClick={() => setActive(c)}
            className={`shrink-0 rounded-md px-3.5 py-2 text-[0.9375rem] transition-colors ${
              c === active
                ? "bg-brand font-semibold text-white"
                : "text-gray-600 hover:text-ink"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {featured ? (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
          <FeaturedArticle article={featured} />
          {rest.length > 0 && (
            <div className="grid grid-cols-1 content-start gap-3 sm:grid-cols-2">
              {rest.slice(0, 6).map((a) => (
                <ArticleCard key={a.title} article={a} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-5 rounded-xl border border-dashed border-line py-16 text-center text-[0.9375rem] text-gray-500">
          No recent news in {active}.
        </p>
      )}
    </Card>
  );
}
