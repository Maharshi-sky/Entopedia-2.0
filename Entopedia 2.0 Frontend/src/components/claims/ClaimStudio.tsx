"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { ChevronDown, CloudUpload, Sparkles, X, ShieldAlert, CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import { clientApi } from "@/lib/client-api";

const geographies = [
  "India",
  "United States",
  "European Union",
  "United Kingdom",
  "Brazil",
  "China",
  "Southeast Asia",
];

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[0.9375rem] text-[#1C1B18] outline-none placeholder:text-gray-400 focus:border-brand";

const labelClass = "mb-1.5 block text-[0.9375rem] font-semibold text-[#1C1B18]";

interface RuleMatch {
  rule_code: string;
  category: string;
  severity: "low" | "substantiation_required" | "high_regulatory_flag";
  matched_text: string;
  reason: string;
  required_evidence: string;
  protocol: string;
  suggestion: string;
}

interface AssessResult {
  text: string;
  risk: "low" | "substantiation_required" | "high_regulatory_flag";
  matches: RuleMatch[];
}

function ClaimValidator() {
  const [claimText, setClaimText] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [assessment, setAssessment] = useState<AssessResult | null>(null);

  const sampleChips = [
    "Kills dengue mosquitoes in 5 minutes",
    "Continuous 12-hour protection",
    "100% safe for children",
  ];

  async function checkClaim(textToCheck: string) {
    if (!textToCheck.trim()) {
      setAssessment(null);
      return;
    }
    setEvaluating(true);
    try {
      const res = await clientApi<AssessResult>("/claim/assess", {
        method: "POST",
        body: JSON.stringify({ text: textToCheck }),
      });
      setAssessment(res);
    } catch (err) {
      console.warn("Claim assessment error:", err);
    } finally {
      setEvaluating(false);
    }
  }

  // Evaluate 400ms after typing stops
  useEffect(() => {
    const timer = setTimeout(() => {
      if (claimText.trim()) {
        checkClaim(claimText);
      } else {
        setAssessment(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [claimText]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-[#1C1B18]">Rule-Based Claim Assessment</h2>
          <p className="text-xs text-gray-500">
            Instant evaluation against WHO insecticide efficacy guidelines and CIB&amp;RC regulations
          </p>
        </div>
        {assessment && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
              assessment.risk === "low"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : assessment.risk === "substantiation_required"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {assessment.risk === "low" && <CheckCircle2 className="size-3.5" />}
            {assessment.risk === "substantiation_required" && <AlertTriangle className="size-3.5" />}
            {assessment.risk === "high_regulatory_flag" && <AlertOctagon className="size-3.5" />}
            {assessment.risk.replace(/_/g, " ")}
          </span>
        )}
      </div>

      <div>
        <label htmlFor="claim-eval-input" className={labelClass}>
          Marketing Claim Text
        </label>
        <input
          id="claim-eval-input"
          value={claimText}
          onChange={(e) => setClaimText(e.target.value)}
          placeholder="e.g. Kills dengue mosquitoes in 5 minutes"
          className={inputClass}
          maxLength={300}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-400">Quick Test Samples:</span>
        {sampleChips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setClaimText(chip);
              checkClaim(chip);
            }}
            className="rounded-lg border border-line bg-gray-50/70 px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-brand/40 hover:bg-brand-soft"
          >
            {chip}
          </button>
        ))}
      </div>

      {evaluating && (
        <p className="text-xs text-gray-400 animate-pulse">Running sub-100ms rule engine evaluation...</p>
      )}

      {assessment && assessment.matches.length > 0 && (
        <div className="mt-2 space-y-2.5 border-t border-line pt-3">
          {assessment.matches.map((m, idx) => (
            <div
              key={idx}
              className={`rounded-lg border p-3 text-xs ${
                m.severity === "high_regulatory_flag"
                  ? "border-red-200 bg-red-50/60 text-red-900"
                  : "border-amber-200 bg-amber-50/60 text-amber-900"
              }`}
            >
              <div className="flex items-center justify-between font-bold">
                <span>Trigger: &ldquo;{m.matched_text}&rdquo; ({m.category})</span>
                <span className="text-[0.7rem] uppercase">{m.protocol}</span>
              </div>
              <p className="mt-1 leading-relaxed">{m.reason}</p>
              <div className="mt-2 rounded border border-white/60 bg-white/70 p-2 text-ink">
                <span className="font-semibold text-brand">Suggested Rewording: </span>
                {m.suggestion}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectForm() {
  const [status, setStatus] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Claim project created. Use the live Claim Assessment engine above to validate wording.");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5"
    >
      <h2 className="text-lg font-medium text-[#1C1B18]">New Claim Project</h2>

      <div>
        <label htmlFor="claim-product" className={labelClass}>
          Product Name
        </label>
        <input
          id="claim-product"
          required
          placeholder="e.g. MosqShield Pro, GreenGuard Indoor"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="claim-actives" className={labelClass}>
          Active Ingredients
        </label>
        <input
          id="claim-actives"
          placeholder="e.g. Deltamethrin 0.5%, Neem Extract 2%"
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="claim-description" className={labelClass}>
          Product Description
        </label>
        <textarea
          id="claim-description"
          rows={3}
          placeholder="e.g. Indoor plug-in, slow-release, botanical actives"
          className={`${inputClass} resize-y`}
        />
      </div>

      <div>
        <label htmlFor="claim-geo" className={labelClass}>
          Target Geography
        </label>
        <div className="relative">
          <select
            id="claim-geo"
            defaultValue="India"
            className={`${inputClass} cursor-pointer appearance-none pr-9`}
          >
            {geographies.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-[#1C1B18]" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-brand/90"
        >
          <Sparkles className="size-4" strokeWidth={1.75} />
          Save Project Dossier
        </button>
        {status && <p className="text-xs text-gray-500">{status}</p>}
      </div>
    </form>
  );
}

function ImageDrop() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  function accept(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (PNG, JPG or WebP).");
      return;
    }
    setError(null);
    setPreview({ url: URL.createObjectURL(file), name: file.name });
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        accept(e.dataTransfer.files[0]);
      }}
      className={`flex min-h-72 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
        dragging ? "border-brand bg-brand-soft" : "border-gray-200 bg-white"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {preview ? (
        <>
          <div className="relative h-44 w-full max-w-xs">
            <Image
              src={preview.url}
              alt={preview.name}
              fill
              unoptimized
              className="rounded-lg object-contain"
            />
          </div>
          <p className="mt-3 max-w-full truncate text-[0.9375rem] font-semibold text-[#1C1B18]">
            {preview.name}
          </p>
          <p className="mt-1 text-xs text-emerald-600 font-medium">
            Pack artwork attached to dossier.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-[#f1f3f2] px-3 py-2 text-[0.8125rem] font-medium text-[#1C1B18] transition-colors hover:bg-gray-200"
            >
              <CloudUpload className="size-4" strokeWidth={1.75} />
              Replace
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.8125rem] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#1C1B18]"
            >
              <X className="size-4" />
              Remove
            </button>
          </div>
        </>
      ) : (
        <>
          <CloudUpload className="size-8 text-gray-500" strokeWidth={1.5} />
          <p className="mt-3 text-[0.9375rem] text-[#1C1B18]">
            Optional: Upload Product Image / Packaging Artwork
          </p>
          <p className={`mt-1 text-xs ${error ? "text-red-600" : "text-gray-500"}`}>
            {error ?? "Attach visual label pack-shot for verification dossier compliance."}
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#f1f3f2] px-3 py-2 text-[0.8125rem] font-medium text-[#1C1B18] transition-colors hover:bg-gray-200"
          >
            <CloudUpload className="size-4" strokeWidth={1.75} />
            Browse Image
          </button>
        </>
      )}
    </div>
  );
}

export function ClaimStudio() {
  return (
    <div className="flex flex-col gap-4">
      <ClaimValidator />
      <ProjectForm />
      <ImageDrop />
    </div>
  );
}