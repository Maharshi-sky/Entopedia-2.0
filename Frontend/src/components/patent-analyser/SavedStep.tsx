"use client";

import { useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { listSaved } from "./saved-reads";
import { primaryButton, secondaryButton } from "./styles";

/** The sheets kept in this browser: open one to carry on where its reading stopped, or delete it. */
export function SavedStep({
  currentKey,
  savedRev,
  onOpen,
  onDelete,
}: {
  /** Fingerprint of the sheet open now, marked in the list. */
  currentKey: string;
  /** Changes whenever something is saved or deleted, so the list is read again. */
  savedRev: number;
  onOpen: (key: string) => boolean;
  onDelete: (key: string) => void;
}) {
  // localStorage is only read here, after the analyser is on screen (this tab is never the first one shown).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const entries = useMemo(() => listSaved(), [savedRev]);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <>
      <section>
        <h2 className="text-base font-semibold text-ink">Saved sheets</h2>
        <p className="mt-1 text-xs text-gray-600">
          Sheets you loaded here, with their AI reads, kept in this browser only. The last 5 are kept; open one to
          carry on where you stopped.
        </p>
      </section>

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}

      {entries.length === 0 ? (
        <Card className="py-4">
          <p className="text-xs text-gray-600">
            Nothing is saved yet. Load a sheet on the Load tab and it appears here, with its reads once you run Read.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.key}>
              <Card className="flex flex-wrap items-start gap-4">
                <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-brand" strokeWidth={1.75} />
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    <span className="break-all">{e.name}</span>
                    {e.key === currentKey && (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-brand">
                        Open now
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    {e.rows} records
                    {e.columns ? ` · ${e.columns} columns` : ""}
                    {e.size ? ` · ${(e.size / 1024).toFixed(1)} KB` : ""} ·{" "}
                    {e.readCount ? `${e.readCount} of ${e.rows} read` : "not read yet"}
                    {e.savedAt ? ` · last used ${new Date(e.savedAt).toLocaleString()}` : ""}
                  </p>
                  {e.brief && <p className="mt-1.5 line-clamp-2 text-xs text-gray-500">Brief: {e.brief}</p>}
                  {!e.hasSheet && (
                    <p className="mt-1.5 text-xs text-amber-700">
                      Too large to keep the rows here: load the same file on the Load tab and its reads come back.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={!e.hasSheet}
                    onClick={() => {
                      setError(onOpen(e.key) ? null : "That sheet's rows are no longer saved. Load the file again.");
                    }}
                    className={primaryButton}
                  >
                    Open
                  </button>
                  {confirming === e.key ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDelete(e.key);
                        setConfirming(null);
                      }}
                      className={`${secondaryButton} border-red-200 text-red-700`}
                    >
                      Confirm delete
                    </button>
                  ) : (
                    <button type="button" onClick={() => setConfirming(e.key)} className={secondaryButton}>
                      Delete
                    </button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
