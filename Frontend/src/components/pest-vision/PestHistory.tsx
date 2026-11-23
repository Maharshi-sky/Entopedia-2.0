"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Bug, Loader2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { clientApi } from "@/lib/client-api";
import { getMe } from "@/lib/profile-actions";

// Pest Vision history: every identification is its own entry (its own id) with a small copy of the
// photo, so entries are told apart by the picture, never by the file name.

export type HistoryEntry = {
  id: string;
  filename: string | null;
  thumbnail: string | null;
  outcome: "identified" | "unlisted" | "unsure" | "no_pest";
  species: string | null;
  common_name: string | null;
  pest_type: string | null;
  confidence: number;
  confidence_level: "high" | "medium" | "low";
  identified_at: string;
  user_name: string | null;
};

const outcomeLabel: Record<HistoryEntry["outcome"], { text: string; tone: string }> = {
  identified: { text: "Identified", tone: "bg-brand-soft text-brand" },
  unlisted: { text: "Not in library", tone: "bg-amber-100 text-amber-800" },
  unsure: { text: "Unsure", tone: "bg-amber-100 text-amber-800" },
  no_pest: { text: "No pest", tone: "bg-gray-100 text-gray-600" },
};

const levelText: Record<HistoryEntry["confidence_level"], string> = {
  high: "text-brand",
  medium: "text-amber-600",
  low: "text-red-600",
};

function when(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function errorText(error: unknown, fallback: string) {
  const raw = error instanceof Error ? error.message : "";
  try {
    return (JSON.parse(raw) as { error?: string }).error ?? fallback;
  } catch {
    return raw || fallback;
  }
}

export function PestHistory({ onOpen }: { onOpen: (id: string) => Promise<void> }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [everyone, setEveryone] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    getMe().then((me) => {
      if (current) setIsAdmin(me?.role === "admin");
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    clientApi<{ data: HistoryEntry[] }>(`/pest-vision/history?limit=120${everyone ? "&everyone=true" : ""}`)
      .then((res) => {
        if (!current) return;
        setEntries(res.data);
        setError(null);
      })
      .catch((err) => {
        if (current) setError(errorText(err, "Couldn't load the history."));
      });
    return () => {
      current = false;
    };
  }, [everyone]);

  async function open(id: string) {
    setOpening(id);
    try {
      await onOpen(id);
    } catch (err) {
      setError(errorText(err, "Couldn't open this entry."));
    } finally {
      setOpening(null);
    }
  }

  async function remove(entry: HistoryEntry) {
    if (!window.confirm(`Remove "${entry.filename ?? "this photo"}" from the history?`)) return;
    try {
      await clientApi(`/pest-vision/history/${entry.id}`, { method: "DELETE" });
      setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null);
    } catch (err) {
      setError(errorText(err, "Couldn't remove it."));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          Every photo you identify is kept here with a small copy of the picture. The same photo uploaded again, under any
          name, is recognised by its content and answered from here at once.
        </p>
        {isAdmin && (
          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
            <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} className="size-4 accent-brand" />
            Everyone&apos;s identifications
          </label>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {entries === null && !error ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="size-4 animate-spin" /> Loading history…
        </p>
      ) : entries && entries.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">No identifications yet. Upload a photo under AI Identification.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {entries?.map((e) => {
            const label = outcomeLabel[e.outcome] ?? outcomeLabel.identified;
            return (
              <div key={e.id} className="group relative flex gap-3 rounded-xl border border-line bg-white p-3 transition-colors hover:border-brand/40">
                <button
                  type="button"
                  onClick={() => void open(e.id)}
                  className="flex min-w-0 flex-1 gap-3 text-left"
                  aria-label={`Open ${e.filename ?? "identification"}`}
                >
                  <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-gray-50">
                    {e.thumbnail ? (
                      <Image src={e.thumbnail} alt="" fill unoptimized className="object-cover" />
                    ) : (
                      <Bug className="size-5 text-gray-300" strokeWidth={1.5} />
                    )}
                    {opening === e.id && (
                      <span className="absolute inset-0 grid place-items-center bg-white/70">
                        <Loader2 className="size-4 animate-spin text-brand" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold ${label.tone}`}>{label.text}</span>
                    <span className="mt-1 block truncate text-[0.875rem] font-semibold text-ink">
                      {e.common_name ?? (e.outcome === "no_pest" ? "No pest found" : "Unidentified")}
                    </span>
                    {e.species && <span className="block truncate text-xs text-gray-500 italic">{e.species}</span>}
                    <span className="mt-0.5 block truncate text-[0.6875rem] text-gray-500" suppressHydrationWarning>
                      {e.filename ?? "photo"} · {when(e.identified_at)}
                      {everyone && e.user_name ? ` · ${e.user_name}` : ""}
                    </span>
                  </span>
                  {e.outcome !== "no_pest" && (
                    <span className={`shrink-0 text-xs font-bold tabular-nums ${levelText[e.confidence_level]}`}>
                      {Math.round(e.confidence * 100)}%
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(e)}
                  aria-label={`Remove ${e.filename ?? "identification"} from history`}
                  className="absolute right-2 bottom-2 hidden rounded p-1 text-gray-400 group-hover:block hover:text-red-600 focus-visible:block"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
