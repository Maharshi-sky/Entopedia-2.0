"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  CloudUpload,
  Search,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
  Dna,
  RotateCcw,
  AlertOctagon,
  HelpCircle,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Thumbnail } from "@/components/ui/Thumbnail";
import { clientApi } from "@/lib/client-api";
import { PestHistory } from "./PestHistory";
import type { Pest, PestType } from "@/data/pests";

const tabs = ["AI Identification", "History", "Encyclopedia"] as const;
type Tab = (typeof tabs)[number];

const typeTone: Record<PestType, BadgeTone> = {
  Mosquito: "red",
  Cockroach: "amber",
  Fly: "indigo",
  Ant: "purple",
  "Bed bug": "orange",
  Rodent: "gray",
};

type ConfidenceLevel = "high" | "medium" | "low";

interface IdentificationResult {
  id: string;
  is_pest: boolean;
  /** False for "no pest", and for a pest that isn't in the Entopedia library. */
  in_library: boolean;
  needs_review: boolean;
  message?: string;
  identified_at?: string;
  /** The same photo (by its SHA-256, not its name) was identified before; this is that answer, reused. */
  cached?: boolean;
  first_identified_at?: string | null;
  model_used?: string;
  visual_observation?: string;
  visible_features?: string[];
  confidence: number;
  confidence_level: ConfidenceLevel;
  alternatives?: { species: string; common_name: string; confidence: number }[];
  species?: string | null;
  common_name?: string | null;
  pest_type?: PestType | null;
  similar_species?: string[];
  biology?: {
    order?: string;
    family?: string;
    regions?: string[];
    habitats?: string;
    vector_transmission?: string;
    resistance_notes?: string;
  };
  recommended_actives?: string[];
  related_products?: Array<{
    id: string;
    brand: string;
    name: string;
    active_ingredient?: string;
    price?: number;
    pack_size?: string;
    product_link?: string;
    image_url?: string;
  }>;
}

const levelStyle: Record<ConfidenceLevel, { label: string; bar: string; text: string }> = {
  high: { label: "High confidence", bar: "bg-brand", text: "text-brand" },
  medium: { label: "Likely, verify manually", bar: "bg-amber-500", text: "text-amber-600" },
  low: { label: "Low confidence", bar: "bg-red-500", text: "text-red-600" },
};

// 640 px keeps detail for identification while the vision model (often on CPU) reads it several times faster.
const MAX_SIDE = 640;

/** The history keeps a small copy of each photo, so entries show the actual picture, not just a file name. */
const THUMB_SIDE = 160;

/** The photo as a JPEG data URL, at most `maxSide` px on its longer side. */
async function shrink(file: File, maxSide: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't prepare the photo.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** A history entry opened on the identify view. */
export type OpenedIdentification = { photoUrl: string | null; name: string; result: IdentificationResult };

/** The API's error text from a failed clientApi call ({"error": "..."} or plain text). */
function errorText(error: unknown) {
  const raw = error instanceof Error ? error.message : "";
  try {
    return (JSON.parse(raw) as { error?: string }).error ?? "Identification failed.";
  } catch {
    return raw || "Identification failed. Check that the API is running and try again.";
  }
}

function ConfidenceBar({ result }: { result: IdentificationResult }) {
  const style = levelStyle[result.confidence_level];
  const pct = Math.round(result.confidence * 100);
  return (
    <div className="mt-3 w-full">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-gray-500">AI confidence</span>
        <span className={`font-bold ${style.text}`}>
          {pct}% · {style.label}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full transition-all duration-700 ${style.bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** What the model saw: its one-line description and the features it based the answer on. */
function Observation({ result }: { result: IdentificationResult }) {
  if (!result.visual_observation && !result.visible_features?.length) return null;
  return (
    <div className="mt-4 rounded-lg border border-line bg-gray-50/70 p-3 text-xs text-gray-600">
      <p className="font-semibold text-gray-700">What the model saw</p>
      {result.visual_observation && <p className="mt-1 leading-relaxed">{result.visual_observation}</p>}
      {result.visible_features && result.visible_features.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          {result.visible_features.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Alternatives({ result }: { result: IdentificationResult }) {
  if (!result.alternatives?.length) return null;
  return (
    <div className="mt-3 text-xs text-gray-600">
      <span className="font-semibold text-gray-700">Could also be: </span>
      {result.alternatives.map((a, i) => (
        <span key={a.species}>
          {i > 0 && ", "}
          {a.common_name} (<i>{a.species}</i>, {Math.round(a.confidence * 100)}%)
        </span>
      ))}
    </div>
  );
}

type Prepared = { image: string; thumbnail: string; filename: string };

function Identify({ opened }: { opened?: OpenedIdentification | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // url: an object URL for a picked file (revoked when replaced), or a history thumbnail.
  const [photo, setPhoto] = useState<{ url: string | null; name: string; objectUrl: boolean } | null>(
    opened ? { url: opened.photoUrl, name: opened.name, objectUrl: false } : null,
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<IdentificationResult | null>(opened?.result ?? null);
  const [error, setError] = useState<string | null>(null);
  // The prepared photo of the current upload, kept for "Run again".
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  useEffect(() => {
    return () => {
      if (photo?.objectUrl && photo.url) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  async function identify(input: Prepared, force: boolean) {
    setError(null);
    setResult(null);
    setAnalyzing(true);
    try {
      const response = await clientApi<IdentificationResult>("/pest-vision/identify", {
        method: "POST",
        body: JSON.stringify({ image_base64: input.image, thumbnail: input.thumbnail, filename: input.filename, force }),
      });
      setResult(response);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a photo (PNG, JPG or WebP).");
      return;
    }
    setPhoto({ url: URL.createObjectURL(file), name: file.name, objectUrl: true });
    let ready: Prepared;
    try {
      const [image, thumbnail] = await Promise.all([shrink(file, MAX_SIDE, 0.85), shrink(file, THUMB_SIDE, 0.7)]);
      ready = { image, thumbnail, filename: file.name };
    } catch {
      setError("This photo couldn't be read. Try a JPG or PNG.");
      return;
    }
    setPrepared(ready);
    await identify(ready, false);
  }

  function handleReset() {
    setPrepared(null);
    setPhoto(null);
    setResult(null);
    setError(null);
    setAnalyzing(false);
  }

  return (
    <div className="space-y-6">
      {!photo ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFile(e.dataTransfer.files[0]);
          }}
          className={`flex min-h-80 flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            dragging
              ? "border-brand bg-brand-soft shadow-inner"
              : "border-gray-300 bg-white hover:border-brand/50 hover:bg-gray-50/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand shadow-sm">
            <CloudUpload className="size-7" strokeWidth={1.75} />
          </span>
          <p className="mt-4 text-lg font-semibold text-ink">Drag &amp; Drop Field Photo</p>
          <p className={`mt-1 text-xs ${error ? "text-red-600" : "text-gray-500"}`}>
            {error ?? "A close, sharp photo of one specimen works best"}
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-5 flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand/90 hover:shadow"
          >
            <CloudUpload className="size-4" strokeWidth={2} />
            Identify Specimen
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: the photo and the confidence */}
          <Card className="flex flex-col items-center p-5 text-center">
            <div className="relative grid aspect-square w-full max-w-72 place-items-center overflow-hidden rounded-xl border border-line bg-gray-50">
              {photo.url ? (
                <Image src={photo.url} alt={photo.name} fill unoptimized className="object-contain p-2" />
              ) : (
                <span className="text-xs text-gray-400">No photo was stored for this entry</span>
              )}
            </div>
            <p className="mt-3 w-full truncate text-xs font-semibold text-gray-700" title={photo.name}>
              {photo.name}
            </p>
            {result?.is_pest && <ConfidenceBar result={result} />}
            {result?.model_used && <p className="mt-2 text-[0.6875rem] text-gray-400">Model: {result.model_used}</p>}

            {opened && result && (
              <p className="mt-3 w-full rounded-lg bg-gray-50 px-3 py-2 text-[0.75rem] text-gray-600" suppressHydrationWarning>
                From your history · {formatWhen(result.identified_at)}
              </p>
            )}
            {!opened && result?.cached && (
              <div className="mt-3 w-full rounded-lg border border-brand/20 bg-brand-soft px-3 py-2 text-left text-[0.75rem] text-brand">
                <p className="font-semibold">Seen this exact photo before</p>
                <p className="mt-0.5 text-brand/80" suppressHydrationWarning>
                  Same picture (matched by its content, not its name) was identified on {formatWhen(result.first_identified_at)}.
                  That answer is shown.
                </p>
                {prepared && (
                  <button
                    type="button"
                    onClick={() => void identify(prepared, true)}
                    className="mt-1.5 font-semibold underline hover:no-underline"
                  >
                    Run the model again
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg border border-line px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-gray-50"
            >
              <RotateCcw className="size-3.5" />
              Scan Another Specimen
            </button>
          </Card>

          {/* Right: working / error / no pest / unlisted pest / identified */}
          <div className="space-y-4 lg:col-span-2">
            {analyzing ? (
              <Card className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
                <div className="relative size-14">
                  <div className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
                  <div className="size-14 animate-spin rounded-full border-4 border-brand border-t-transparent" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">Looking at the specimen…</h3>
                <p className="mt-1 max-w-sm text-xs text-gray-500">
                  The local vision model can take up to a minute, longer the first time it loads.
                </p>
              </Card>
            ) : error ? (
              <Card className="flex min-h-80 flex-col justify-between p-6">
                <div>
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                    <AlertOctagon className="size-3.5" /> Identification didn&apos;t run
                  </span>
                  <h2 className="mt-3 text-xl font-bold text-ink">Couldn&apos;t identify this photo</h2>
                  <p className="mt-2 text-sm text-gray-600">{error}</p>
                </div>
                <div className="border-t border-line pt-4 text-right">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand/90"
                  >
                    <RotateCcw className="size-3.5" /> Try again
                  </button>
                </div>
              </Card>
            ) : result && (!result.is_pest || !result.in_library) ? (
              <Card className="flex min-h-80 flex-col justify-between p-6">
                <div>
                  <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    {result.is_pest ? "Pest outside the library" : "No pest identified"}
                  </span>
                  <h2 className="mt-3 text-xl font-bold text-ink">
                    {result.is_pest ? `Looks like ${result.common_name}` : "No pest could be identified"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">{result.message}</p>
                  <Observation result={result} />
                  <Alternatives result={result} />
                  <div className="mt-4 rounded-xl border border-line bg-gray-50 p-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <HelpCircle className="size-3.5 text-brand" />
                      Tips for accurate identification
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>One specimen, close up, in good light and in focus.</li>
                      <li>Show the body from above so legs, wings and markings are visible.</li>
                      <li>The library covers mosquitoes, cockroaches, house flies, bed bugs, Pharaoh ants and brown rats.</li>
                    </ul>
                  </div>
                </div>
                <div className="border-t border-line pt-4 text-right">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand/90"
                  >
                    <CloudUpload className="size-3.5" />
                    Upload Different Photo
                  </button>
                </div>
              </Card>
            ) : result ? (
              <>
                <Card className="p-5">
                  {result.needs_review && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      <span>
                        <span className="font-semibold">Likely, not certain.</span> The model is only{" "}
                        {Math.round(result.confidence * 100)}% sure. Check the features below against the specimen before acting on it.
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        {result.pest_type && (
                          <Badge tone={typeTone[result.pest_type] || "green"} pill>
                            {result.pest_type}
                          </Badge>
                        )}
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${levelStyle[result.confidence_level].text}`}>
                          <CheckCircle2 className="size-3.5" /> AI identification
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-bold text-ink">{result.common_name}</h2>
                      <p className="text-sm font-medium text-gray-500 italic">{result.species}</p>
                    </div>
                  </div>

                  <Observation result={result} />
                  <Alternatives result={result} />

                  <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    {result.biology?.vector_transmission && (
                      <div className="rounded-lg border border-line bg-gray-50/70 p-3">
                        <div className="flex items-center gap-1.5 font-semibold text-gray-700">
                          <ShieldAlert className="size-3.5 text-amber-600" />
                          Disease Transmission
                        </div>
                        <p className="mt-1 leading-relaxed text-gray-600">{result.biology.vector_transmission}</p>
                      </div>
                    )}
                    {result.biology?.habitats && (
                      <div className="rounded-lg border border-line bg-gray-50/70 p-3">
                        <div className="flex items-center gap-1.5 font-semibold text-gray-700">
                          <Dna className="size-3.5 text-brand" />
                          Breeding &amp; Habitat
                        </div>
                        <p className="mt-1 leading-relaxed text-gray-600">{result.biology.habitats}</p>
                      </div>
                    )}
                  </div>

                  {result.biology?.resistance_notes && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      <div>
                        <span className="font-semibold">Resistance Watch: </span>
                        {result.biology.resistance_notes}
                      </div>
                    </div>
                  )}

                  {result.recommended_actives && result.recommended_actives.length > 0 && (
                    <div className="mt-4 border-t border-line pt-4">
                      <p className="text-xs font-semibold text-gray-700">Recommended Chemical Actives for Control:</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {result.recommended_actives.map((act) => (
                          <span
                            key={act}
                            className="rounded-lg border border-brand/20 bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand"
                          >
                            {act}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {result.related_products && result.related_products.length > 0 && (
                  <Card className="p-4">
                    <h3 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                      Commercial Formulations Targeting This Pest
                    </h3>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {result.related_products.map((prod) => (
                        <div
                          key={prod.id}
                          className="flex items-center gap-3 rounded-lg border border-line p-2.5 transition-colors hover:border-brand/40"
                        >
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-gray-100">
                            <Thumbnail src={prod.image_url || "/pl1.jpg"} alt={prod.name} sizes="48px" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-ink">{prod.name}</p>
                            <p className="truncate text-[0.75rem] text-gray-500">{prod.active_ingredient || "Active Formulation"}</p>
                            {prod.price && <span className="text-xs font-bold text-brand tabular-nums">₹{prod.price}</span>}
                          </div>
                          {prod.product_link && (
                            <a
                              href={prod.product_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-gray-400 hover:text-brand"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Encyclopedia({ pests }: { pests: Pest[] }) {
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("All");

  const pestTypes = ["All", "Mosquito", "Cockroach", "Fly", "Ant", "Bed bug", "Rodent"];

  const q = query.trim().toLowerCase();
  const shown = pests.filter((p) => {
    const matchesQuery =
      !q ||
      [p.name, p.scientific, p.type, p.regions, p.note].some((v) =>
        v.toLowerCase().includes(q)
      );
    const matchesType = selectedType === "All" || p.type === selectedType;
    return matchesQuery && matchesType;
  });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 focus-within:border-brand sm:w-80">
          <Search className="size-4 shrink-0 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search pests"
            placeholder="Search species, disease or region..."
            className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-gray-400"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {pestTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                selectedType === type
                  ? "bg-brand text-white"
                  : "border border-line bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      {shown.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <article
              key={p.scientific}
              className="overflow-hidden rounded-xl border border-line bg-white shadow-xs transition-shadow hover:shadow-md"
            >
              <div className="relative h-40">
                <Thumbnail
                  src={p.image || `/pests/${p.type.toLowerCase()}.jpg`}
                  alt={p.name}
                  sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 90vw"
                />
              </div>
              <div className="p-4">
                <Badge tone={typeTone[p.type]} pill>
                  {p.type}
                </Badge>
                <h2 className="mt-2 text-base font-semibold text-ink">{p.name}</h2>
                <p className="text-xs text-gray-500 italic">{p.scientific}</p>
                <p className="mt-2 text-xs text-gray-600 leading-relaxed">{p.note}</p>
                <p className="mt-3 text-[0.75rem] font-semibold tracking-wider text-gray-400 uppercase">
                  {p.regions}
                </p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-line py-16 text-center text-sm text-gray-500">
          No species match “{query}”.
        </p>
      )}
    </>
  );
}

export function PestVision({ pests }: { pests: Pest[] }) {
  const [tab, setTab] = useState<Tab>("AI Identification");
  const [opened, setOpened] = useState<OpenedIdentification | null>(null);

  async function openFromHistory(id: string) {
    const entry = await clientApi<IdentificationResult & { filename?: string; thumbnail?: string | null }>(
      `/pest-vision/history/${id}`,
    );
    setOpened({ photoUrl: entry.thumbnail ?? null, name: entry.filename ?? "photo", result: entry });
    setTab("AI Identification");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Pest Vision</h1>
          <p className="mt-1 text-sm text-gray-500">
            Identify species from photos and explore the global pest encyclopedia
          </p>
        </div>
        <div role="tablist" aria-label="Pest vision views" className="flex gap-2">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={t === tab}
              onClick={() => {
                // Choosing AI Identification starts a new scan; a history entry opens there via openFromHistory.
                if (t === "AI Identification") setOpened(null);
                setTab(t);
              }}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
                t === tab
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-white text-ink hover:bg-gray-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === "AI Identification" ? (
        // A new key starts a fresh identify view for each history entry opened (and for "New").
        <Identify key={opened?.result.id ?? "new"} opened={opened} />
      ) : tab === "History" ? (
        <PestHistory onOpen={openFromHistory} />
      ) : (
        <Encyclopedia pests={pests} />
      )}
    </div>
  );
}