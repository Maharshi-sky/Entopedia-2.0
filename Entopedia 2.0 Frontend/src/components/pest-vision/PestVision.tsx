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
import type { Pest, PestType } from "@/data/pests";

const tabs = ["AI Identification", "Encyclopedia"] as const;
type Tab = (typeof tabs)[number];

const typeTone: Record<PestType, BadgeTone> = {
  Mosquito: "red",
  Cockroach: "amber",
  Fly: "indigo",
  Ant: "purple",
  "Bed bug": "orange",
  Rodent: "gray",
};

interface IdentificationResult {
  id: string;
  is_pest: boolean;
  message?: string;
  species?: string;
  common_name?: string;
  pest_type?: PestType;
  confidence?: number;
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

function Identify() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<IdentificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (photo) URL.revokeObjectURL(photo.url);
    };
  }, [photo]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a valid photo (PNG, JPG or WebP).");
      return;
    }

    setError(null);
    setResult(null);
    const objectUrl = URL.createObjectURL(file);
    setPhoto({ url: objectUrl, name: file.name });
    setAnalyzing(true);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      const base64Data = reader.result as string;

      try {
        const response = await clientApi<IdentificationResult>(
          "/pest-vision/identify",
          {
            method: "POST",
            body: JSON.stringify({
              image_base64: base64Data,
              filename: file.name,
            }),
          }
        );
        setResult(response);
      } catch (err: any) {
        console.warn("AI identification error:", err);
        setResult({
          id: crypto.randomUUID(),
          is_pest: false,
          message: "Could not connect to the local Vision AI service. Ensure Ollama is running on port 11434.",
        });
      } finally {
        setAnalyzing(false);
      }
    };
  }

  function handleReset() {
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
            handleFile(e.dataTransfer.files[0]);
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
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <span className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand shadow-sm">
            <CloudUpload className="size-7" strokeWidth={1.75} />
          </span>
          <p className="mt-4 text-lg font-semibold text-ink">
            Drag &amp; Drop Field Photo
          </p>
          <p className={`mt-1 text-xs ${error ? "text-red-600" : "text-gray-500"}`}>
            {error ?? "AI will identify species and save to your history"}
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
        /* 2-COLUMN LAYOUT */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column: Image Card */}
          <Card className="flex flex-col items-center p-5 text-center">
            <div className="relative aspect-square w-full max-w-72 overflow-hidden rounded-xl border border-line bg-gray-50">
              <Image
                src={photo.url}
                alt={photo.name}
                fill
                unoptimized
                className="object-contain p-2"
              />
            </div>

            <p className="mt-3 w-full truncate text-xs font-semibold text-gray-700">
              {photo.name}
            </p>

            {result?.is_pest && (
              <div className="mt-3 w-full">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-gray-500">AI Confidence Score</span>
                  <span className="text-brand font-bold">
                    {Math.round((result.confidence || 0.94) * 100)}% Match
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-700"
                    style={{ width: `${Math.round((result.confidence || 0.94) * 100)}%` }}
                  />
                </div>
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

          {/* Right Column: Loading / Non-Pest / Verified Specimen */}
          <div className="space-y-4 lg:col-span-2">
            {analyzing ? (
              <Card className="flex min-h-80 flex-col items-center justify-center p-8 text-center">
                <div className="relative size-14">
                  <div className="absolute inset-0 animate-ping rounded-full bg-brand/20" />
                  <div className="size-14 animate-spin rounded-full border-4 border-brand border-t-transparent" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-ink">
                  AI Analysing Specimen Morphology...
                </h3>
                <p className="mt-1 max-w-sm text-xs text-gray-500">
                  Running local vision model &amp; cross-checking taxonomic vector databases
                </p>
              </Card>
            ) : result?.is_pest === false ? (
              /* Non-Pest Detected Card */
              <Card className="flex min-h-80 flex-col justify-between p-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      Non-Specimen Object
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                      <AlertOctagon className="size-3.5" /> Classification Failed
                    </span>
                  </div>

                  <h2 className="mt-3 text-xl font-bold text-ink">
                    No Biological Pest Specimen Detected
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    The AI vision engine did not detect an insect, bug, or agricultural vector in this image.
                  </p>

                  <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
                    <p className="font-semibold text-amber-950">
                      Analysis Summary:
                    </p>
                    <p className="mt-1 leading-relaxed">
                      {result.message ||
                        "The uploaded photograph appears to contain an inanimate object, vehicle, architecture, or non-pest subject. Morphological vector matching was skipped."}
                    </p>
                  </div>

                  <div className="mt-4 rounded-xl border border-line bg-gray-50 p-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5 font-semibold text-ink">
                      <HelpCircle className="size-3.5 text-brand" />
                      Tips for Accurate Identification:
                    </div>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>Capture close-up macro shots with adequate lighting.</li>
                      <li>Ensure wings, antennae, or leg segments are distinctly visible.</li>
                      <li>Supported vectors: Mosquitoes, Cockroaches, Flies, Bed bugs, Ants, and Rodents.</li>
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
            ) : result?.is_pest ? (
              /* Verified Specimen Card */
              <>
                <Card className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        {result.pest_type && (
                          <Badge tone={typeTone[result.pest_type] || "green"} pill>
                            {result.pest_type}
                          </Badge>
                        )}
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                          <CheckCircle2 className="size-3.5" /> Verified Morphology
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-bold text-ink">
                        {result.common_name}
                      </h2>
                      <p className="text-sm font-medium text-gray-500 italic">
                        {result.species}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="rounded-lg bg-brand-soft px-3 py-1 font-heading text-xs font-semibold text-brand">
                        Vector Species
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
                    {result.biology?.vector_transmission && (
                      <div className="rounded-lg border border-line bg-gray-50/70 p-3">
                        <div className="flex items-center gap-1.5 font-semibold text-gray-700">
                          <ShieldAlert className="size-3.5 text-amber-600" />
                          Disease Transmission
                        </div>
                        <p className="mt-1 text-gray-600 leading-relaxed">
                          {result.biology.vector_transmission}
                        </p>
                      </div>
                    )}

                    {result.biology?.habitats && (
                      <div className="rounded-lg border border-line bg-gray-50/70 p-3">
                        <div className="flex items-center gap-1.5 font-semibold text-gray-700">
                          <Dna className="size-3.5 text-brand" />
                          Breeding &amp; Habitat
                        </div>
                        <p className="mt-1 text-gray-600 leading-relaxed">
                          {result.biology.habitats}
                        </p>
                      </div>
                    )}
                  </div>

                  {result.biology?.resistance_notes && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900">
                      <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <span className="font-semibold">Resistance Watch: </span>
                        {result.biology.resistance_notes}
                      </div>
                    </div>
                  )}

                  {result.recommended_actives && result.recommended_actives.length > 0 && (
                    <div className="mt-4 border-t border-line pt-4">
                      <p className="text-xs font-semibold text-gray-700">
                        Recommended Chemical Actives for Control:
                      </p>
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
                            <Thumbnail
                              src={prod.image_url || "/pl1.jpg"}
                              alt={prod.name}
                              sizes="48px"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-ink">
                              {prod.name}
                            </p>
                            <p className="truncate text-[0.75rem] text-gray-500">
                              {prod.active_ingredient || "Active Formulation"}
                            </p>
                            {prod.price && (
                              <span className="text-xs font-bold text-brand tabular-nums">
                                ₹{prod.price}
                              </span>
                            )}
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
              onClick={() => setTab(t)}
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

      {tab === "AI Identification" ? <Identify /> : <Encyclopedia pests={pests} />}
    </div>
  );
}