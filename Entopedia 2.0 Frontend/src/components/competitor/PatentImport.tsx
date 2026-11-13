"use client";

import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { CloudUpload, FileCheck2 } from "lucide-react";

const ACCEPTED = [".csv", ".pdf", ".xlsx"];
const MAX_BYTES = 50 * 1024 * 1024;

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand";

function FileDrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function accept(candidate: File | undefined) {
    if (!candidate) return;
    const ext = candidate.name.slice(candidate.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPTED.includes(ext)) {
      setError("Only CSV, PDF and XLSX files are supported.");
      return;
    }
    if (candidate.size > MAX_BYTES) {
      setError("That file is over the 50MB limit.");
      return;
    }
    setError(null);
    setFile(candidate);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files[0]);
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        dragging
          ? "border-brand bg-brand-soft"
          : "border-gray-200 bg-[#fafbfa] hover:border-gray-300 hover:bg-white"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      <span className="grid size-10 place-items-center rounded-lg border border-emerald-200 bg-brand-soft text-brand">
        {file ? (
          <FileCheck2 className="size-5" strokeWidth={1.75} />
        ) : (
          <CloudUpload className="size-5" strokeWidth={1.75} />
        )}
      </span>
      <span className="mt-2 text-[0.9375rem] font-semibold text-ink">
        {file ? file.name : "Upload or drag and drop file"}
      </span>
      <span className={`text-xs ${error ? "text-red-600" : "text-gray-500"}`}>
        {error ??
          (file
            ? `${(file.size / 1024 / 1024).toFixed(1)} MB · click to choose another`
            : "CSV, PDF, XLSX (Max 50MB)")}
      </span>
    </button>
  );
}

function ApiConnect() {
  const [status, setStatus] = useState<string | null>(null);

  // No sync service exists yet: validate the input, but send nothing.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(
      "Live sync isn't available yet — your endpoint and key were not sent anywhere.",
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 p-6">
      <div>
        <h3 className="text-[0.9375rem] font-semibold text-ink">
          Connect your API
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Sync live competitor data directly from internal endpoints
        </p>
      </div>
      <input
        type="url"
        required
        aria-label="API endpoint URL"
        placeholder="API Endpoint URL (e.g. https://api.skyquest.com/v1/...)"
        className={inputClass}
      />
      <div className="flex gap-2">
        <input
          type="password"
          required
          autoComplete="off"
          aria-label="Bearer token or API key"
          placeholder="Bearer Token / API Key"
          className={inputClass}
        />
        <button
          type="submit"
          className="shrink-0 rounded-lg bg-brand px-5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90"
        >
          Connect
        </button>
      </div>
      {status && <p className="text-xs text-gray-500">{status}</p>}
    </form>
  );
}

export function PatentImport() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FileDrop />
      <div className="rounded-xl border border-line bg-white">
        <ApiConnect />
      </div>
    </div>
  );
}
