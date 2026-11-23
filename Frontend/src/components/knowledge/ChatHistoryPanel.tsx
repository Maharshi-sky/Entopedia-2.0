"use client";

import { History, Loader2, MessageSquare, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { deleteChat, newChat, openChat, type ChatSummary } from "@/lib/knowledge-chat";

// Previous Chats: New Chat on top, then the user's earlier Knowledge Hub chats, newest first.
// Sits beside the chat at the same height (its list scrolls on its own).

function when(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  return d.toDateString() === today.toDateString()
    ? d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ChatHistoryPanel({
  chats,
  loaded,
  activeChatId,
  pendingChatId,
}: {
  chats: ChatSummary[];
  loaded: boolean;
  activeChatId: string | null;
  /** The chat a question is being answered in (null = a new chat, undefined = none). */
  pendingChatId: string | null | undefined;
}) {
  function remove(chat: ChatSummary) {
    if (window.confirm(`Delete the chat "${chat.title}"? Its questions stay in the audit log.`)) {
      void deleteChat(chat.id);
    }
  }

  return (
    // h-0 + min-h-full: as tall as the chat beside it, never taller (on wide screens).
    <Card flush className="flex min-h-64 flex-col overflow-hidden lg:h-0 lg:min-h-full">
      <div className="flex items-center gap-2 border-b border-line bg-[#E5E8E3] px-3 py-3">
        <History className="size-4 shrink-0 text-brand" strokeWidth={1.75} />
        <h2 className="truncate text-[0.9375rem] font-semibold text-ink">Previous Chats</h2>
      </div>

      <div className="p-2">
        <button
          type="button"
          onClick={newChat}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.875rem] font-semibold transition-colors ${
            activeChatId === null ? "bg-brand text-white" : "border border-line bg-white text-ink hover:border-brand hover:text-brand"
          }`}
        >
          <Plus className="size-4 shrink-0" strokeWidth={2} />
          <span className="truncate">New Chat</span>
        </button>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2" aria-label="Previous chats">
        {!loaded && (
          <li className="flex items-center gap-2 px-2 py-2 text-xs text-gray-500">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </li>
        )}
        {loaded && chats.length === 0 && <li className="px-2 py-2 text-xs text-gray-500">No earlier chats yet.</li>}
        {chats.map((chat) => {
          const active = chat.id === activeChatId;
          return (
            <li key={chat.id} className="group relative">
              <button
                type="button"
                onClick={() => void openChat(chat.id)}
                aria-current={active ? "true" : undefined}
                title={chat.title}
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 pr-7 text-left transition-colors ${
                  active ? "bg-brand-soft text-brand" : "text-ink hover:bg-gray-50"
                }`}
              >
                {pendingChatId === chat.id ? (
                  <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-brand" />
                ) : (
                  <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-gray-400" strokeWidth={1.75} />
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[0.8125rem] ${active ? "font-semibold" : ""}`}>{chat.title}</span>
                  <span className="block truncate text-[0.6875rem] text-gray-500" suppressHydrationWarning>
                    {when(chat.updatedAt)} · {chat.questions} {chat.questions === 1 ? "question" : "questions"}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete chat ${chat.title}`}
                onClick={() => remove(chat)}
                className="absolute top-2 right-1.5 hidden rounded p-0.5 text-gray-400 group-hover:block hover:text-red-600 focus-visible:block"
              >
                <Trash2 className="size-3.5" strokeWidth={1.75} />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
