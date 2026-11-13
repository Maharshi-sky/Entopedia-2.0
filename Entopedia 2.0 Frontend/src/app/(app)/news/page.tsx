import type { Metadata } from "next";
import { NewsFeed } from "@/components/news/NewsFeed";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Intelligence News · Entopedia",
};

export default async function NewsPage() {
  const articles = await api.news();
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Intelligence News</h1>
        <p className="mt-1 text-sm text-gray-500">
          Curated global updates across industry, science, technology,
          regulatory, safety, disease, and more
        </p>
      </div>
      <NewsFeed articles={articles} />
    </>
  );
}
