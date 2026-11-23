import type { Metadata } from "next";
import { NewsletterStudio } from "@/components/newsletter/NewsletterStudio";
import { api } from "@/lib/api";

export const metadata: Metadata = {
  title: "Newsletter Studio · Entopedia",
};

export default async function NewsletterPage() {
  const [articles, approvalChat] = await Promise.all([api.news(), api.approvalChat()]);
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold text-ink">Newsletter Studio</h1>
        <p className="mt-1 text-sm text-gray-500">
          Compose and distribute rich intelligence digests to stakeholders
        </p>
      </div>
      <NewsletterStudio articles={articles} approvalChat={approvalChat} />
    </>
  );
}
