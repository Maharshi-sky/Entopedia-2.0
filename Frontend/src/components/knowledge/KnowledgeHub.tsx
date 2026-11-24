"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CloudUpload, Download, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
import { AskForm } from "@/components/ui/AskForm";
import { Card } from "@/components/ui/Card";
import { TabBar } from "@/components/ui/TabBar";
import { primaryButton } from "@/components/patent-analyser/styles";
import { clientApi } from "@/lib/client-api";
import { askKnowledgeHub, knowledgeChat, loadChats, setScope } from "@/lib/knowledge-chat";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import {
  suggestedQuestions,
  type DocumentStatus,
  type KnowledgeDocument,
} from "@/data/knowledge";

// Files are uploaded to the API, which extracts their text and indexes it; "Ask" answers from
// that text with the AI (Groq) and cites the file and page of every excerpt it used.

const tabs = ["Upload Intelligence", "Saved Assets", "Ask Knowledge Hub"] as const;
type Tab = (typeof tabs)[number];

const ACCEPTED = [".pdf", ".xlsx", ".docx", ".csv", ".txt"];
const MAX_MB = 25;

const statusColor: Record<DocumentStatus | "uploading", string> = {
  indexed: "text-amber-500",
  processing: "text-[#E4572E]",
  failed: "text-red-600",
  uploading: "text-gray-500",
};

const sectionLabel = "text-[0.8125rem] font-semibold tracking-wider text-gray-600 uppercase";

type Raw = Record<string, unknown>;

function toDocument(d: Raw): KnowledgeDocument {
  return {
    id: String(d.id),
    filename: String(d.filename ?? ""),
    fileType: String(d.file_type ?? ""),
    size: Number(d.file_size ?? 0),
    status: (d.status as DocumentStatus) ?? "processing",
    error: d.error ? String(d.error) : null,
    pages: d.pages == null ? null : Number(d.pages),
    chunks: d.chunks == null ? null : Number(d.chunks),
    uploadedBy: d.uploaded_by ? String(d.uploaded_by) : null,
    uploaderId: d.user_id ? String(d.user_id) : null,
    createdAt: String(d.created_at ?? ""),
  };
}

/** The API's error text from a failed clientApi call ({"error": "..."} or plain text). */
function errorText(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  try {
    return (JSON.parse(raw) as { error?: string }).error ?? fallback;
  } catch {
    return raw || fallback;
  }
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const downloadHref = (id: string) => `/api/knowledge/${id}/download`;

type Uploading = { key: string; name: string; size: number; error: string | null };

function UploadIntelligence({
  documents,
  uploading,
  onFiles,
  onDismiss,
  loadError,
}: {
  documents: KnowledgeDocument[];
  uploading: Uploading[];
  onFiles: (files: File[]) => void;
  onDismiss: (key: string) => void;
  loadError: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function accept(list: FileList | null | undefined) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const ext = (f: File) => f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
    const valid = files.filter((f) => ACCEPTED.includes(ext(f)) && f.size <= MAX_MB * 1024 * 1024);
    setError(
      valid.length < files.length
        ? `Some files were skipped: use PDF, Excel (.xlsx), Word (.docx), CSV or text, up to ${MAX_MB} MB.`
        : null,
    );
    if (valid.length > 0) onFiles(valid);
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
          {error ?? `Drop PDFs, Excel, Word, CSV or text files here (up to ${MAX_MB} MB each)`}
        </p>
        <button type="button" onClick={() => inputRef.current?.click()} className={`mt-5 ${primaryButton}`}>
          Select Files
        </button>
      </div>

      <Card>
        <h2 className={sectionLabel}>Ingestion Queue</h2>
        {loadError && <p role="alert" className="mt-3 text-xs text-red-600">Couldn&apos;t load documents: {loadError}</p>}
        {uploading.length === 0 && documents.length === 0 && !loadError ? (
          <p className="mt-3 text-sm text-gray-500">Nothing uploaded yet. Uploaded files are read and indexed so you can ask questions about them.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {uploading.map((u) => (
              <li key={u.key} className="flex items-center gap-3 rounded-lg border border-line bg-[#fafbfa] px-3 py-2.5">
                <FileText className="size-6 shrink-0 text-gray-500" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p title={u.name} className="truncate text-[0.9375rem] font-semibold text-ink">{u.name}</p>
                  <p className={`text-xs ${u.error ? "text-red-600" : "text-gray-500"}`}>{u.error ?? formatSize(u.size)}</p>
                </div>
                {u.error ? (
                  <button type="button" onClick={() => onDismiss(u.key)} className="text-xs font-semibold text-gray-500 hover:text-ink">
                    Dismiss
                  </button>
                ) : (
                  <span className={`flex shrink-0 items-center gap-1.5 text-[0.8125rem] font-bold tracking-wider uppercase ${statusColor.uploading}`}>
                    <Loader2 className="size-3.5 animate-spin" /> Uploading
                  </span>
                )}
              </li>
            ))}
            {documents.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-lg border border-line bg-[#fafbfa] px-3 py-2.5">
                <FileText className="size-6 shrink-0 text-gray-500" strokeWidth={1.5} />
                <div className="min-w-0 flex-1">
                  <p title={d.filename} className="truncate text-[0.9375rem] font-semibold text-ink">{d.filename}</p>
                  <p className={`text-xs ${d.status === "failed" ? "text-red-600" : "text-gray-500"}`}>
                    {d.status === "failed"
                      ? d.error
                      : [formatSize(d.size), d.pages ? `${d.pages} ${d.fileType === "xlsx" ? "sheets" : "pages"}` : null, d.chunks ? `${d.chunks} passages` : null]
                          .filter(Boolean)
                          .join(" · ")}
                  </p>
                </div>
                <span className={`flex shrink-0 items-center gap-1.5 text-[0.8125rem] font-bold tracking-wider uppercase ${statusColor[d.status]}`}>
                  {d.status === "processing" && <Loader2 className="size-3.5 animate-spin" />}
                  {d.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SavedAssets({
  documents,
  onDelete,
}: {
  documents: KnowledgeDocument[];
  onDelete: (doc: KnowledgeDocument) => void;
}) {
  if (documents.length === 0) {
    return (
      <Card>
        <p className="text-sm text-gray-500">No indexed documents yet. Upload one under Upload Intelligence.</p>
      </Card>
    );
  }
  return (
    <Card flush className="overflow-hidden">
      <ul className="divide-y divide-line">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-[#f5f6f5] text-gray-500">
              <FileText className="size-4" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-semibold text-ink">{d.filename}</p>
              <p className="text-[0.8125rem] tracking-wider text-gray-500 uppercase" suppressHydrationWarning>
                {d.uploadedBy ?? "Unknown"} · {formatDate(d.createdAt)} · {formatSize(d.size)}
              </p>
            </div>
            <a
              href={downloadHref(d.id)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line bg-[#f1f3f2] px-3 py-2 text-[0.8125rem] font-semibold tracking-wider text-ink uppercase transition-colors hover:bg-gray-200"
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">Download</span>
            </a>
            <button
              type="button"
              aria-label={`Remove ${d.filename}`}
              title="Remove (only the uploader or an admin)"
              onClick={() => onDelete(d)}
              className="grid size-9 shrink-0 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="size-4" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AskKnowledgeHub({ documents }: { documents: KnowledgeDocument[] }) {
  // The conversation lives in a store outside this component, so leaving the page doesn't lose it.
  const { messages, scope, chats, chatsLoaded, activeChatId, loadingChat, pendingChatId } = useSyncExternalStore(
    knowledgeChat.subscribe,
    knowledgeChat.get,
    () => knowledgeChat.initial,
  );
  const busy = pendingChatId !== undefined;
  const threadRef = useRef<HTMLDivElement>(null);
  const indexed = documents.filter((d) => d.status === "indexed");

  // Which documents answers come from. scope null = all (including ones uploaded later); otherwise
  // the ticked ones that are still indexed.
  const selected = scope === null ? indexed.map((d) => d.id) : scope.filter((id) => indexed.some((d) => d.id === id));
  const allSelected = indexed.length > 0 && selected.length === indexed.length;
  const scopeLabel =
    allSelected || selected.length === 0
      ? undefined
      : selected.length === 1
        ? `Only ${indexed.find((d) => d.id === selected[0])?.filename}`
        : `${selected.length} of ${indexed.length} documents`;

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setScope(next.length === indexed.length ? null : next);
  }

  useEffect(() => {
    void loadChats();
  }, []);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const canAsk = !busy && selected.length > 0;
  const ask = (question: string) => {
    if (!canAsk) return;
    void askKnowledgeHub(question, allSelected ? null : selected, scopeLabel);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* The chat (80%) and its Previous Chats panel (20%), side by side at the same height. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[4fr_1fr]">
      <Card flush className="flex min-h-80 min-w-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-[#E5E8E3] px-4 py-3">
          <Sparkles className="size-4 text-brand" strokeWidth={1.75} />
          <h2 className="min-w-0 truncate text-[0.9375rem] font-semibold text-ink">
            {activeChatId ? (chats.find((c) => c.id === activeChatId)?.title ?? "Ask Knowledge Hub") : "New chat"}
          </h2>
        </div>
        <div ref={threadRef} className="flex max-h-[32rem] min-h-28 flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          {loadingChat && (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="size-4 animate-spin" /> Opening chat…
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg border px-3.5 py-2.5 text-[0.9375rem] ${
                m.role === "user"
                  ? "self-end border-brand bg-brand text-white"
                  : m.role === "assistant" && m.error
                    ? "self-start border-red-200 bg-red-50 text-red-700"
                    : "self-start border-line bg-white text-ink"
              }`}
            >
              {m.role === "assistant" && m.pending && <Loader2 className="mr-1.5 inline size-4 animate-spin align-[-3px]" />}
              <span className="whitespace-pre-wrap">{m.text}</span>
              {m.role === "user" && m.scope && <span className="mt-1 block text-xs text-white/75">{m.scope}</span>}
              {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-line pt-2 text-xs text-gray-600">
                  {m.sources.map((s) => (
                    <li key={s.ref}>
                      <span className="font-semibold text-ink">[{s.ref}]</span>{" "}
                      <a href={downloadHref(s.documentId)} className="hover:text-brand hover:underline">
                        {s.filename}
                      </a>
                      {s.page ? `, page ${s.page}` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="border-t border-line p-3">
          <AskForm
            onAsk={ask}
            variant="panel"
            placeholder={
              indexed.length === 0
                ? "Upload a document first, then ask about it..."
                : selected.length === 0
                  ? "Tick at least one document below to ask about it..."
                  : allSelected
                    ? "Ask across all your uploaded documents..."
                    : `Ask about ${scopeLabel?.replace(/^Only /, "")}...`
            }
          />
          {indexed.length > 0 && selected.length === 0 && (
            <p role="alert" className="mt-2 text-xs text-red-600">No document is selected. Tick one or more under Sources in Scope.</p>
          )}
        </div>
      </Card>
      <ChatHistoryPanel chats={chats} loaded={chatsLoaded} activeChatId={activeChatId} pendingChatId={pendingChatId} />
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={sectionLabel}>Sources in Scope</h2>
            {indexed.length > 1 && (
              <button
                type="button"
                onClick={() => setScope(allSelected ? [] : null)}
                className="text-[0.8125rem] font-semibold text-brand hover:underline"
              >
                {allSelected ? "Clear all" : "Select all"}
              </button>
            )}
          </div>
          {indexed.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No indexed documents yet.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-gray-500">
                Answers use only the ticked documents · {allSelected ? `all ${indexed.length}` : `${selected.length} of ${indexed.length}`} selected
              </p>
              <ul className="mt-2 divide-y divide-line">
                {indexed.map((d) => (
                  <li key={d.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.includes(d.id)}
                        onChange={() => toggle(d.id)}
                        className="size-4 shrink-0 accent-brand"
                      />
                      <FileText className="size-4 shrink-0 text-gray-500" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink" title={d.filename}>
                        {d.filename}
                      </span>
                      <span className="shrink-0 text-xs text-gray-500">
                        {d.pages ? `${d.pages} ${d.fileType === "xlsx" ? "sheets" : "pages"}` : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <Card>
          <h2 className={sectionLabel}>Suggested Questions</h2>
          <div className="mt-3 flex flex-col gap-2">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={!canAsk}
                onClick={() => ask(q)}
                className="rounded-lg border border-line bg-[#f5f6f5] px-3 py-2 text-left text-[0.9375rem] text-ink transition-colors hover:border-brand/40 hover:bg-brand-soft disabled:opacity-50"
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

type Fetched = { ok: true; documents: KnowledgeDocument[] } | { ok: false; error: string };

async function fetchDocuments(): Promise<Fetched> {
  try {
    const res = await clientApi<{ data: Raw[] }>("/knowledge/documents");
    return { ok: true, documents: res.data.map(toDocument) };
  } catch (error) {
    return { ok: false, error: errorText(error, "the API didn't answer") };
  }
}

// The tab last open, so coming back to the page shows the same view (e.g. a question being answered).
let lastTab: Tab = "Upload Intelligence";

export function KnowledgeHub() {
  const [tab, setTabState] = useState<Tab>(() => lastTab);
  const setTab = (next: Tab) => {
    lastTab = next;
    setTabState(next);
  };
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((result: Fetched) => {
    if (result.ok) {
      setDocuments(result.documents);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, []);

  const load = useCallback(async () => apply(await fetchDocuments()), [apply]);

  // First load, then again every few seconds while anything is still being read.
  const processing = documents.some((d) => d.status === "processing");
  useEffect(() => {
    let current = true;
    const refresh = () =>
      fetchDocuments().then((result) => {
        if (current) apply(result);
      });
    if (!processing) {
      void refresh();
      return () => {
        current = false;
      };
    }
    const timer = window.setInterval(refresh, 3000);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [processing, apply]);

  async function upload(files: File[]) {
    const items = files.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, name: f.name, size: f.size, error: null }));
    setUploading((prev) => [...items, ...prev]);
    await Promise.all(
      files.map(async (file, i) => {
        const key = items[i].key;
        const body = new FormData();
        body.append("file", file);
        // Not clientApi: the browser must set the multipart Content-Type (with its boundary) itself.
        const res = await fetch("/api/backend/knowledge/documents", { method: "POST", body }).catch(() => null);
        if (res?.ok) {
          setUploading((prev) => prev.filter((u) => u.key !== key));
        } else {
          const text = res ? await res.text().catch(() => "") : "";
          const message = errorText(new Error(text), res ? `Upload failed (${res.status})` : "Upload failed: the server didn't answer");
          setUploading((prev) => prev.map((u) => (u.key === key ? { ...u, error: message } : u)));
        }
      }),
    );
    await load();
  }

  async function remove(doc: KnowledgeDocument) {
    if (!window.confirm(`Remove ${doc.filename} from the Knowledge Hub? This can't be undone.`)) return;
    try {
      await clientApi(`/knowledge/documents/${doc.id}`, { method: "DELETE" });
      setNotice(`Removed ${doc.filename}.`);
      await load();
    } catch (error) {
      setNotice(errorText(error, "Couldn't remove it."));
    }
  }

  const indexed = documents.filter((d) => d.status === "indexed");

  return (
    <>
      <div className="w-fit max-w-full">
        <TabBar tabs={tabs} value={tab} onChange={setTab} label="Knowledge hub views" />
      </div>

      {notice && (
        <p role="status" className="rounded-lg border border-line bg-white px-4 py-2.5 text-xs text-gray-600">
          {notice}
        </p>
      )}

      {tab === "Upload Intelligence" ? (
        <UploadIntelligence
          documents={documents}
          uploading={uploading}
          onFiles={(files) => void upload(files)}
          onDismiss={(key) => setUploading((prev) => prev.filter((u) => u.key !== key))}
          loadError={loadError}
        />
      ) : tab === "Saved Assets" ? (
        <SavedAssets documents={indexed} onDelete={(d) => void remove(d)} />
      ) : (
        <AskKnowledgeHub documents={documents} />
      )}
    </>
  );
}
