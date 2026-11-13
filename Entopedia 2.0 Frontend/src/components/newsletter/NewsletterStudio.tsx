"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  Bold,
  Check,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquare,
  Plus,
  Radio,
  Send,
  Underline,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Thumbnail } from "@/components/ui/Thumbnail";
import { categoryTone, type Article } from "@/components/news/articles";
import type { ChatMessage as StoredMessage } from "@/data/newsletter";

const inputClass =
  "w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand";

// Starting draft. Set once; after that the editor's DOM is the source of truth.
const DRAFT = `
<h2 class="font-heading text-xl font-semibold text-ink">Intelligence Brief: APAC Vector Forecast</h2>
<p class="mt-4">Dear Stakeholders,</p>
<p class="mt-3">Recent predictive modeling has surfaced a critical alert for the Asia-Pacific region. Advanced AI models, analyzing shifting climate patterns and historical outbreak data, predict a significant spread of Malaria vectors over the next two quarters.</p>
<div class="mt-4 rounded-r-lg border-l-4 border-brand bg-[#f1f3f2] px-4 py-3">
  <h3 class="font-heading text-lg font-semibold text-ink">Key Forecast Insights</h3>
  <ul class="mt-2 list-disc space-y-1 pl-5">
    <li><strong>High-Risk Zones:</strong> Expanded habitats projected in Southeast Asia and Northern Australia.</li>
    <li><strong>Contributing Factors:</strong> Unprecedented torrential rain cycles and elevated humidity indices.</li>
    <li><strong>Timeline:</strong> Accelerated vector breeding anticipated by early Q3.</li>
  </ul>
</div>
<p class="mt-4 font-semibold text-ink">Strategic Recommendations:</p>
<p class="mt-2">We advise prioritizing the deployment and marketing of next-generation biological repellents and spatial IoT monitoring systems in the affected regions. Early engagement with regional distributors is highly recommended to secure supply chains before peak demand.</p>
<p class="mt-4" data-signoff>Best regards,<br><strong class="text-ink">Skyquest Intelligence Team</strong></p>
`;

const tools: { icon: LucideIcon; label: string; command: string }[] = [
  { icon: Bold, label: "Bold", command: "bold" },
  { icon: Italic, label: "Italic", command: "italic" },
  { icon: Underline, label: "Underline", command: "underline" },
  { icon: List, label: "Bulleted list", command: "insertUnorderedList" },
  { icon: ListOrdered, label: "Numbered list", command: "insertOrderedList" },
  { icon: Link2, label: "Insert link", command: "createLink" },
  { icon: ImagePlus, label: "Insert image", command: "insertImage" },
];

// Messages typed on this page are marked local: they haven't been sent anywhere.
type ChatMessage = StoredMessage & { local?: boolean };

function ApprovalChat({ initial }: { initial: StoredMessage[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { from: "You", text, mine: true, local: true }]);
    setValue("");
  }

  return (
    <Card flush className="flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-[#f1f3f2] px-4 py-3">
        <MessageSquare className="size-4 text-brand" strokeWidth={1.75} />
        <h2 className="text-[0.9375rem] font-semibold text-ink">Approval Chat</h2>
      </div>
      <div className="flex max-h-72 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={m.mine ? "self-end text-right" : "self-start"}>
            <p className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">
              {m.from}
            </p>
            <p
              className={`mt-1 max-w-[18rem] border px-3 py-2 text-left text-[0.9375rem] ${
                m.mine
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-[#f5f6f5] text-ink"
              }`}
            >
              {m.text}
            </p>
            {m.local && (
              <p className="mt-1 text-[0.75rem] text-gray-400">
                Not delivered — chat isn&apos;t connected yet
              </p>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-line p-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Message"
          placeholder="Tag @manager..."
          className={inputClass}
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-brand px-4 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90"
        >
          Send
        </button>
      </form>
    </Card>
  );
}

export function NewsletterStudio({
  articles,
  approvalChat,
}: {
  articles: Article[];
  approvalChat: StoredMessage[];
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [inserted, setInserted] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function runCommand(command: string) {
    let arg: string | undefined;
    if (command === "createLink" || command === "insertImage") {
      arg = window.prompt(command === "createLink" ? "Link URL" : "Image URL") ?? "";
      if (!/^https?:\/\//i.test(arg)) return;
    }
    editorRef.current?.focus();
    // execCommand is deprecated but still the simplest rich-text option without an editor library.
    document.execCommand(command, false, arg);
  }

  // Adds the article as a paragraph just above the sign-off.
  function insertArticle(article: Article) {
    const editor = editorRef.current;
    if (!editor || inserted.includes(article.title)) return;
    const p = document.createElement("p");
    p.className = "mt-3";
    const title = document.createElement("strong");
    title.className = "text-ink";
    title.textContent = article.title;
    const source = document.createElement("em");
    source.className = "text-gray-400";
    source.textContent = ` (${article.source})`;
    p.append(title, ` — ${article.summary}`, source);
    const signoff = editor.querySelector("[data-signoff]");
    if (signoff) editor.insertBefore(p, signoff);
    else editor.append(p);
    setInserted((prev) => [...prev, article.title]);
  }

  function pullRecent() {
    articles.slice(0, 3).forEach(insertArticle);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.9fr_1fr]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="space-y-3">
          <div className="flex items-center gap-3">
            <label htmlFor="nl-to" className="w-20 shrink-0 text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
              To:
            </label>
            <input
              id="nl-to"
              defaultValue="stakeholders@skyquest.com, team@skyquest.com"
              className={inputClass}
            />
          </div>
          <div className="flex items-center gap-3">
            <label htmlFor="nl-subject" className="w-20 shrink-0 text-[0.8125rem] font-semibold tracking-wider text-gray-500 uppercase">
              Subject:
            </label>
            <input
              id="nl-subject"
              defaultValue="Intelligence Alert: AI Predicts Malaria Spread in APAC"
              className={`${inputClass} font-semibold`}
            />
          </div>
        </Card>

        <Card flush className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
            {tools.map(({ icon: Icon, label, command }) => (
              <button
                key={command}
                type="button"
                aria-label={label}
                title={label}
                disabled={preview}
                // Keep the text selection in the editor while clicking.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runCommand(command)}
                className="grid size-8 place-items-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 hover:text-ink disabled:opacity-40"
              >
                <Icon className="size-4" strokeWidth={1.75} />
              </button>
            ))}
            <button
              type="button"
              disabled={preview}
              onClick={pullRecent}
              className="ml-auto rounded-lg border border-line bg-[#f1f3f2] px-3 py-1.5 text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-gray-200 disabled:opacity-40"
            >
              Pull from Recent News
            </button>
          </div>
          <div className="px-3 py-6 sm:px-6">
            <div
              ref={editorRef}
              contentEditable={!preview}
              suppressContentEditableWarning
              aria-label="Newsletter body"
              role="textbox"
              aria-multiline
              className={`mx-auto max-w-2xl rounded-lg border border-line bg-white p-6 text-[0.9375rem] leading-relaxed text-gray-600 shadow-sm outline-none sm:p-8 [&_a]:text-brand [&_a]:underline [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg ${
                preview ? "" : "focus:border-brand"
              }`}
              dangerouslySetInnerHTML={{ __html: DRAFT }}
            />
          </div>
        </Card>

        <Card className="flex flex-wrap items-center gap-3 py-3!">
          <span className="rounded-lg border border-line px-3 py-1.5 text-[0.8125rem] font-semibold text-gray-600">
            Status: Draft
          </span>
          {status && <p className="text-xs text-gray-500">{status}</p>}
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPreview((v) => !v)}
              className="rounded-lg border border-line bg-white px-4 py-2 text-[0.9375rem] font-semibold text-ink transition-colors hover:bg-gray-50"
            >
              {preview ? "Back to Editing" : "Preview Test"}
            </button>
            <button
              type="button"
              onClick={() =>
                setStatus("The mail service isn't connected yet, so nothing was sent.")
              }
              className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90"
            >
              <Send className="size-4" strokeWidth={1.75} />
              Dispatch Newsletter
            </button>
          </div>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:self-start">
        <ApprovalChat initial={approvalChat} />
        <Card flush className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line bg-[#f1f3f2] px-4 py-3">
            <Radio className="size-4 text-brand" strokeWidth={1.75} />
            <h2 className="text-[0.9375rem] font-semibold text-ink">
              Recent News Intelligence
            </h2>
          </div>
          <ul className="divide-y divide-line">
            {articles.map((a) => {
              const added = inserted.includes(a.title);
              return (
                <li key={a.title} className="flex gap-3 px-3 py-2.5">
                  <div className="relative w-[4.5rem] shrink-0 self-stretch overflow-hidden rounded-lg">
                    <Thumbnail src={a.image} alt="" sizes="72px" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Badge tone={categoryTone[a.category]} size="sm">
                      {a.category}
                    </Badge>
                    <p
                      title={a.title}
                      className="mt-1 truncate text-[0.875rem] font-semibold text-ink"
                    >
                      {a.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="text-[0.75rem] font-semibold tracking-wider text-gray-500 uppercase">
                        {a.time}
                      </span>
                      <button
                        type="button"
                        disabled={added || preview}
                        onClick={() => insertArticle(a)}
                        className="flex shrink-0 items-center gap-1 rounded-md border border-emerald-200 bg-brand-soft px-2 py-0.5 text-[0.75rem] font-bold tracking-wider text-brand uppercase transition-colors hover:bg-brand hover:text-white disabled:cursor-default disabled:hover:bg-brand-soft disabled:hover:text-brand"
                      >
                        {added ? "Added" : "Insert"}
                        {added ? <Check className="size-3" /> : <Plus className="size-3" />}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
