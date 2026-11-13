"use client";

import { useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { AskForm } from "@/components/ui/AskForm";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { StrategicFilings } from "./StrategicFilings";
import { Competitor360 } from "./Competitor360";
import { LaunchSignals } from "./LaunchSignals";
import { WhiteSpaceFinder } from "./WhiteSpaceFinder";
import { PatentLandscaping } from "./PatentLandscaping";
import { ResearchPapers } from "./ResearchPapers";
import {
  AddProductButton,
  LibraryCount,
  ProductLibrary,
  useProductLibrary,
} from "./ProductLibrary";
import type {
  CompetitorProfile,
  LaunchSignal,
  Paper,
  Patent,
  Product,
  StrategicFiling,
  WhiteSpace,
} from "@/data/competitors";

export type CompetitorData = {
  profiles: CompetitorProfile[];
  launchSignals: LaunchSignal[];
  filings: StrategicFiling[];
  whiteSpace: WhiteSpace;
  patents: Patent[];
  papers: Paper[];
  products: Product[];
};

const tabs = [
  "Overview",
  "Patent Landscaping",
  "Research Papers",
  "Product Library",
] as const;
type Tab = (typeof tabs)[number];

type Message = { role: "assistant" | "user"; text: string };

const GREETING: Message = {
  role: "assistant",
  text: "Ask me anything about competitor strategies, market share, patents, or product filings.",
};

// Placeholder until a real answer service is connected.
const NOT_CONNECTED: Message = {
  role: "assistant",
  text: "The answer engine isn't connected yet, so I can't search patents, papers or products for this question.",
};

export function CompetitorWorkspace({ data }: { data: CompetitorData }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const library = useProductLibrary(data.products);
  const onLibrary = tab === "Product Library";
  const qnaRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  function ask(question: string) {
    setMessages((prev) => [...prev, { role: "user", text: question }, NOT_CONNECTED]);
    setTab("Overview");
    requestAnimationFrame(() => {
      qnaRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  return (
    <>
      {/* The header lives here because Add Product sits beside the title. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Competitor Intelligence</h1>
          <p className="mt-1 text-sm text-gray-500">
            Overview, patent landscaping, research papers and full product library
          </p>
        </div>
        {onLibrary && <AddProductButton library={library} />}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-fit max-w-full">
          <TabBar
            tabs={tabs}
            value={tab}
            onChange={setTab}
            label="Competitor intelligence views"
          />
        </div>
        {onLibrary && <LibraryCount library={library} />}
      </div>

      {tab === "Overview" ? (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.45fr_1fr]">
            <div ref={qnaRef} className="flex">
              <Card flush className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center gap-2 border-b border-line bg-[#f5f6f5] px-4 py-3">
                  <Sparkles className="size-4 text-brand" strokeWidth={1.75} />
                  <h2 className="text-[0.9375rem] font-semibold text-ink">
                    Competitor Intelligence Q&amp;A
                  </h2>
                </div>
                <div
                  ref={threadRef}
                  className="flex max-h-72 min-h-28 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
                >
                  {messages.map((m, i) => (
                    <p
                      key={i}
                      className={`max-w-[85%] rounded-xl border px-3.5 py-2.5 text-[0.9375rem] ${
                        m.role === "user"
                          ? "self-end border-brand bg-brand text-white"
                          : "self-start border-line bg-white text-ink"
                      }`}
                    >
                      {m.text}
                    </p>
                  ))}
                </div>
                <div className="border-t border-line p-3">
                  <AskForm onAsk={ask} variant="panel" />
                </div>
              </Card>
            </div>
            <StrategicFilings filings={data.filings} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <Competitor360 profiles={data.profiles} />
            <LaunchSignals signals={data.launchSignals} />
            <WhiteSpaceFinder data={data.whiteSpace} />
          </div>
        </>
      ) : tab === "Patent Landscaping" ? (
        <PatentLandscaping patents={data.patents} />
      ) : tab === "Research Papers" ? (
        <ResearchPapers papers={data.papers} />
      ) : (
        <ProductLibrary library={library} />
      )}

      {(tab === "Overview" || tab === "Product Library") && (
        <AskForm onAsk={ask} variant="bar" />
      )}
    </>
  );
}
