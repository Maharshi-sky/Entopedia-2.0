"use client";

import { useRef, useState } from "react";
import { CloudUpload, Download, FileText, Sparkles } from "lucide-react";
import { AskForm } from "@/components/ui/AskForm";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { primaryButton } from "@/components/patent-analyser/styles";
import type { QueueItem, QueueStatus, SavedAsset } from "@/data/knowledge";

const tabs = ["Upload Intelligence", "Saved Assets", "Ask Knowledge Hub"] as const;
type Tab = (typeof tabs)[number];

type Status = QueueStatus | "Saved";

const statusColor: Record<Status, string> = {
  Indexed: "text-amber-500",
  Processing: "text-[#E4572E]",
  Awaiting: "text-gray-500",
  Saved: "text-amber-500",
};


const ACCEPTED = [".pdf", ".xls", ".xlsx", ".csv", ".doc", ".docx"];

const sectionLabel =
  "text-[0.8125rem] font-semibold tracking-wider text-gray-600 uppercase";

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function UploadIntelligence({
  queue,
  hasLocalFiles,
  onAdd,
}: {
  queue: QueueItem[];
  // True once files added on this page are in the queue.
  hasLocalFiles: boolean;
  onAdd: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(list: FileList | null | undefined) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const valid = files.filter((f) =>
      ACCEPTED.includes(f.name.slice(f.name.lastIndexOf(".")).toLowerCase()),
    );
    setError(
      valid.length < files.length
        ? "Some files were skipped — only PDFs, Excel, CSV and Word files are supported."
        : null,
    );
    if (valid.length > 0) onAdd(valid);
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files);
        }}
        className={`flex min-h-64 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors sm:min-h-[22rem] ${
          dragging ? "border-brand bg-brand-soft" : "border-gray-200 bg-white"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            accept(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="grid size-12 place-items-center rounded-xl bg-brand-soft text-brand">
          <CloudUpload className="size-6" strokeWidth={1.75} />
        </span>
        <p className="mt-4 text-[0.9375rem] font-bold tracking-widest text-ink uppercase">
          Upload Intelligence Asset
        </p>
        <p className={`mt-1 text-xs ${error ? "text-red-600" : "text-gray-500"}`}>
          {error ?? "Drop PDFs, Excel, or Research Papers here"}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`mt-5 ${primaryButton}`}
        >
          Select Files
        </button>
      </div>

      <Card>
        <h2 className={sectionLabel}>Ingestion Queue</h2>
        <ul className="mt-3 space-y-2">
          {queue.map((item) => (
            <li
              key={item.name}
              className="flex items-center gap-3 rounded-lg border border-line bg-[#fafbfa] px-3 py-2.5"
            >
              <FileText className="size-6 shrink-0 text-gray-500" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <p
                  title={item.name}
                  className="max-w-[12rem] truncate text-[0.9375rem] font-semibold text-ink"
                >
                  {item.name}
                </p>
                <p className="text-xs text-gray-500">{item.size}</p>
              </div>
              <span
                className={`shrink-0 text-[0.8125rem] font-bold tracking-wider uppercase ${statusColor[item.status]}`}
              >
                {item.status}
              </span>
            </li>
          ))}
        </ul>
        {hasLocalFiles && (
          <p className="mt-3 text-xs text-gray-500">
            New files wait here — the indexing service isn&apos;t connected yet, so
            nothing was uploaded.
          </p>
        )}
      </Card>
    </div>
  );
}

function SavedAssets({ savedAssets }: { savedAssets: SavedAsset[] }) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <Card flush className="overflow-hidden">
      <ul className="divide-y divide-line">
        {savedAssets.map((a) => (
          <li key={a.title} className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-[#f5f6f5] text-gray-500">
              <FileText className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-semibold text-ink">
                {a.title}
              </p>
              <p className="text-[0.8125rem] tracking-wider text-gray-500 uppercase">
                {a.author} · {a.when}
              </p>
              {notice === a.title && (
                <p className="mt-1 text-xs text-gray-500">
                  The file store isn&apos;t connected yet, so there&apos;s nothing to
                  download.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setNotice(a.title)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-[#f1f3f2] px-3 py-2 text-[0.8125rem] font-semibold tracking-wider text-ink uppercase transition-colors hover:bg-gray-200"
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

type Message = { role: "assistant" | "user"; text: string };

const GREETING: Message = {
  role: "assistant",
  text: "Ask me anything across your saved assets, uploaded intelligence, and Knowledge Hub. I cite the source document for every answer.",
};

// Placeholder until a real answer service is connected.
const NOT_CONNECTED: Message = {
  role: "assistant",
  text: "The knowledge engine isn't connected yet, so I can't search your documents for this question.",
};

function AskKnowledgeHub({
  queue,
  savedAssets,
  suggestedQuestions,
}: {
  queue: QueueItem[];
  savedAssets: SavedAsset[];
  suggestedQuestions: string[];
}) {
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const threadRef = useRef<HTMLDivElement>(null);

  function ask(question: string) {
    setMessages((prev) => [...prev, { role: "user", text: question }, NOT_CONNECTED]);
    requestAnimationFrame(() =>
      threadRef.current?.scrollTo({
        top: threadRef.current.scrollHeight,
        behavior: "smooth",
      }),
    );
  }

  const sources: { name: string; status: Status }[] = [
    ...queue,
    ...savedAssets.map((a) => ({ name: a.title, status: "Saved" as const })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card flush className="flex min-h-80 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-[#E5E8E3] px-4 py-3">
          <Sparkles className="size-4 text-brand" strokeWidth={1.75} />
          <h2 className="text-[0.9375rem] font-semibold text-ink">
            Ask Knowledge Hub
          </h2>
        </div>
        <div
          ref={threadRef}
          className="flex max-h-[28rem] min-h-28 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4"
        >
          {messages.map((m, i) => (
            <p
              key={i}
              className={`max-w-[85%] rounded-lg border px-3.5 py-2.5 text-[0.9375rem] ${
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
          <AskForm
            onAsk={ask}
            variant="panel"
            placeholder="Ask across your uploaded documents and saved assets..."
          />
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <h2 className={sectionLabel}>Sources in Scope</h2>
          <ul className="mt-2 divide-y divide-line">
            {sources.map((s) => (
              <li key={s.name} className="flex items-center gap-2.5 py-2.5">
                <FileText className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink">
                  {s.name}
                </span>
                <span
                  className={`shrink-0 text-[0.8125rem] font-bold tracking-wider uppercase ${statusColor[s.status]}`}
                >
                  {s.status}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className={sectionLabel}>Suggested Questions</h2>
          <div className="mt-3 flex flex-col gap-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="rounded-lg border border-line bg-[#f5f6f5] px-3 py-2 text-left text-[0.9375rem] text-ink transition-colors hover:border-brand/40 hover:bg-brand-soft"
              >
                {q}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function KnowledgeHub({
  queue: initialQueue,
  savedAssets,
  suggestedQuestions,
}: {
  queue: QueueItem[];
  savedAssets: SavedAsset[];
  suggestedQuestions: string[];
}) {
  const [tab, setTab] = useState<Tab>("Upload Intelligence");
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);

  // Files are listed locally only; nothing is uploaded until indexing exists.
  function addFiles(files: File[]) {
    setQueue((prev) => [
      ...prev,
      ...files
        .filter((f) => !prev.some((q) => q.name === f.name))
        .map((f) => ({ name: f.name, size: formatSize(f.size), status: "Awaiting" as const })),
    ]);
  }

  return (
    <>
      <div className="w-fit max-w-full">
        <TabBar
          tabs={tabs}
          value={tab}
          onChange={setTab}
          label="Knowledge hub views"
        />
      </div>

      {tab === "Upload Intelligence" ? (
        <UploadIntelligence
          queue={queue}
          hasLocalFiles={queue.length > initialQueue.length}
          onAdd={addFiles}
        />
      ) : tab === "Saved Assets" ? (
        <SavedAssets savedAssets={savedAssets} />
      ) : (
        <AskKnowledgeHub
          queue={queue}
          savedAssets={savedAssets}
          suggestedQuestions={suggestedQuestions}
        />
      )}
    </>
  );
}
