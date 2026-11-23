"use client";

import type { AnswerSource } from "@/data/knowledge";
import { clientApi } from "./client-api";

// Knowledge Hub conversations, kept outside the page component so they survive moving to another
// module and back: a question still being answered keeps going and lands in its chat. Chats are
// stored by the API (GET /knowledge/chats), so they are there again after a reload or a new sign-in.

export type ChatMessage =
  | { role: "user"; text: string; scope?: string }
  | { role: "assistant"; text: string; sources?: AnswerSource[]; error?: boolean; pending?: boolean };

export type ChatSummary = { id: string; title: string; updatedAt: string; questions: number };

/**
 * activeChatId: the chat on screen; null = a new chat not saved yet (the first answer creates it).
 * pendingChatId: the chat a question in flight belongs to (undefined = nothing in flight; null = a new chat).
 * scope: the document ids questions are limited to; null = every indexed document.
 */
type State = {
  chats: ChatSummary[];
  chatsLoaded: boolean;
  activeChatId: string | null;
  messages: ChatMessage[];
  loadingChat: boolean;
  pendingChatId: string | null | undefined;
  scope: string[] | null;
};

export const GREETING: ChatMessage = {
  role: "assistant",
  text: "Ask me anything about the documents uploaded to the Knowledge Hub. Every answer cites the file and page it came from, as [S1], [S2]…",
};

const INITIAL: State = {
  chats: [],
  chatsLoaded: false,
  activeChatId: null,
  messages: [GREETING],
  loadingChat: false,
  pendingChatId: undefined,
  scope: null,
};

let state: State = INITIAL;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export const knowledgeChat = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  get: () => state,
  /** Same object on server and first client render, so hydration matches. */
  initial: INITIAL,
};

type RawSource = { ref: string; document_id: string; filename: string; page: number | null };
const toSources = (raw: RawSource[] | undefined): AnswerSource[] =>
  (raw ?? []).map((s) => ({ ref: s.ref, documentId: s.document_id, filename: s.filename, page: s.page }));

function errorText(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  try {
    return (JSON.parse(raw) as { error?: string }).error ?? fallback;
  } catch {
    return raw || fallback;
  }
}

const PENDING: ChatMessage = {
  role: "assistant",
  text: "Reading the documents… the local AI can take a minute or two. You can switch chats or modules; the answer will be saved in this chat.",
  pending: true,
};

/** The chat list, from the API. */
export async function loadChats(): Promise<void> {
  try {
    const res = await clientApi<{ data: { id: string; title: string; updated_at: string; questions: number }[] }>(
      "/knowledge/chats",
    );
    set({
      chatsLoaded: true,
      chats: res.data.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updated_at, questions: c.questions })),
    });
  } catch {
    set({ chatsLoaded: true });
  }
}

/** Shows an earlier chat. A question still being answered in it shows as pending. */
export async function openChat(id: string): Promise<void> {
  if (state.activeChatId === id && !state.loadingChat) return;
  set({ activeChatId: id, loadingChat: true, messages: [] });
  try {
    const res = await clientApi<{ messages: { question: string; answer: string; sources?: RawSource[] }[] }>(
      `/knowledge/chats/${id}`,
    );
    if (state.activeChatId !== id) return; // another chat was opened meanwhile
    const messages: ChatMessage[] = res.messages.flatMap((m) => [
      { role: "user" as const, text: m.question },
      { role: "assistant" as const, text: m.answer, sources: toSources(m.sources) },
    ]);
    set({ loadingChat: false, messages: state.pendingChatId === id ? [...messages, PENDING] : messages });
  } catch (error) {
    if (state.activeChatId !== id) return;
    set({ loadingChat: false, messages: [{ role: "assistant", text: errorText(error, "Couldn't open this chat."), error: true }] });
  }
}

/** A fresh conversation; it is saved when its first question is answered. */
export function newChat() {
  set({ activeChatId: null, loadingChat: false, messages: [GREETING] });
}

export async function deleteChat(id: string): Promise<void> {
  try {
    await clientApi(`/knowledge/chats/${id}`, { method: "DELETE" });
  } catch {
    return;
  }
  set({ chats: state.chats.filter((c) => c.id !== id) });
  if (state.activeChatId === id) newChat();
}

/** Limits questions to these documents (null = all of them). Kept across page visits. */
export function setScope(scope: string[] | null) {
  set({ scope });
}

/**
 * Asks in the chat on screen about the documents in `documentIds` (null = every indexed document).
 * `scopeLabel` is shown under the question, e.g. "2 of 4 documents". One question at a time.
 */
export async function askKnowledgeHub(question: string, documentIds: string[] | null, scopeLabel?: string): Promise<void> {
  if (state.pendingChatId !== undefined) return;
  const chatId = state.activeChatId;
  set({
    pendingChatId: chatId,
    messages: [...state.messages.filter((m) => m !== GREETING), { role: "user", text: question, scope: scopeLabel }, PENDING],
  });

  let reply: ChatMessage;
  let savedChatId = chatId;
  try {
    const res = await clientApi<{ answer: string; sources: RawSource[]; chat_id: string }>("/knowledge/ask", {
      method: "POST",
      body: JSON.stringify({ question, ...(documentIds ? { document_ids: documentIds } : {}), ...(chatId ? { chat_id: chatId } : {}) }),
    });
    reply = { role: "assistant", text: res.answer, sources: toSources(res.sources) };
    savedChatId = res.chat_id;
  } catch (error) {
    reply = { role: "assistant", text: errorText(error, "Couldn't get an answer."), error: true };
  }

  // Still looking at the chat this question was asked in: show the answer there (a new chat now has an id).
  const stillHere = state.activeChatId === chatId;
  set({
    pendingChatId: undefined,
    ...(stillHere
      ? {
          activeChatId: savedChatId,
          messages: [...state.messages.filter((m) => !(m.role === "assistant" && m.pending)), reply],
        }
      : {}),
  });
  void loadChats();
}
