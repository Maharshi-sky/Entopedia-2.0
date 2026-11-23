import type { Metadata } from "next";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { NewsFeed } from "@/components/news/NewsFeed";
import { NewsRefresh } from "@/components/news/NewsRefresh";
import { firstNewsPage } from "@/lib/news-data";
import { verifyJwt } from "@/lib/jwt";
import { DEMO_SESSION, SESSION_COOKIE } from "@/lib/session";

export const metadata: Metadata = {
  title: "Intelligence News · Entopedia",
};

/** The refresh needs the API and an admin token (the API checks the role too). */
async function canRefreshNews(): Promise<boolean> {
  const secret = process.env.ENTOPEDIA_JWT_SECRET;
  if (!process.env.ENTOPEDIA_API_URL || !secret) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token === DEMO_SESSION) return false;
  // verifyJwt reads the clock for the expiry check, so this must run per request, not at prerender.
  await connection();
  return verifyJwt(token, secret)?.role === "admin";
}

// Reads the session per request, so it streams in under <Suspense> and the feed stays prerendered.
async function AdminRefresh() {
  return (await canRefreshNews()) ? <NewsRefresh /> : null;
}

export default async function NewsPage() {
  const first = await firstNewsPage();
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Intelligence News</h1>
        <p className="mt-1 text-sm text-gray-500">
          Curated global updates across industry, science, technology,
          regulatory, safety, disease, and more
        </p>
      </div>
      <Suspense fallback={null}>
        <AdminRefresh />
      </Suspense>
      <NewsFeed initial={first} />
    </>
  );
}
