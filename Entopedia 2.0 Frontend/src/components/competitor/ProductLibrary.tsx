// File: Entopedia 2.0 Frontend/src/components/competitor/ProductLibrary.tsx

"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Check, Plus, X, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Thumbnail } from "@/components/ui/Thumbnail";

import type { Product } from "@/data/competitors";

export interface ProductVariant {
  pack_size: string;
  price: number;
  product_link?: string;
}

export interface ExtendedProduct extends Product {
  product_link?: string;
  pack_size?: string;
  variants?: ProductVariant[];
}

const formats = ["LV", "Coil", "Card", "Aerosol", "Mat", "Liquid Vaporizer"] as const;
const MAX_COMPARE = 3;

const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2 text-[0.9375rem] text-ink outline-none placeholder:text-gray-400 focus:border-brand";

// Client-safe fetch helper with credentials and cross-origin auth support
async function clientFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const url = path.startsWith("http") ? path : `${baseUrl}${path}`;

  let token: string | null = null;
  if (typeof window !== "undefined") {
    token =
      localStorage.getItem("token") ||
      localStorage.getItem("auth_token") ||
      document.cookie
        .split("; ")
        .find((row) => row.startsWith("session="))
        ?.split("=")[1] ||
      null;
  }

  const headers: Record<string, string> = {
    ...(init?.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

// Active ingredient string ko badges me convert karne ka parser
function parseIngredients(active: string): string[] {
  if (!active) return [];
  const cleaned = active.replace(/^["']|["']$/g, "").trim();

  if (cleaned.includes("\n")) {
    return cleaned.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  if (cleaned.includes(",") || cleaned.includes(";")) {
    return cleaned.split(/[,;]\s*/).map((s) => s.trim()).filter(Boolean);
  }

  const parts = cleaned.split(/(?<=%)\s+/);
  if (parts.length > 1) {
    return parts.map((s) => s.trim()).filter(Boolean);
  }

  return [cleaned];
}

// Helper to format backend DB rows into frontend Product type with variants support
function mapDbProductToClient(p: any): ExtendedProduct {
  let claimsList: string[] = [];
  if (Array.isArray(p.claims)) {
    claimsList = p.claims.flatMap((item: string) =>
      typeof item === "string" ? item.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [item]
    );
  } else if (typeof p.claims === "string") {
    claimsList = p.claims.split(/\r?\n/).map((s: string) => s.trim()).filter(Boolean);
  }

  const defaultVariants: ProductVariant[] = p.variants || [
    {
      pack_size: p.pack_available || p.pack_size || "Standard",
      price: Number(p.price) || 0,
      product_link: p.product_link || p.link || "#",
    },
  ];

  return {
    id: String(p.id ?? crypto.randomUUID()),
    brand: p.brand || "",
    name: p.name || "",
    active: p.active_ingredient || p.active || "",
    format: p.format || "LV",
    claims: claimsList,
    price: Number(p.price) || 0,
    image: p.image_url || p.image || "/pl1.jpg",
    product_link: p.product_link || p.link || "",
    pack_size: p.pack_available || p.pack_size || "Standard",
    variants: defaultVariants,
  };
}

// Individual card component with shared Pack Size state
function ProductCard({
  product,
  selected,
  full,
  selectedSize,
  onSizeChange,
  onToggleCompare,
}: {
  product: ExtendedProduct;
  selected: boolean;
  full: boolean;
  selectedSize: string;
  onSizeChange: (size: string) => void;
  onToggleCompare: (id: string) => void;
}) {
  const variants =
    product.variants && product.variants.length > 0
      ? product.variants
      : [
          {
            pack_size: product.pack_size || "Standard",
            price: product.price,
            product_link: product.product_link,
          },
        ];

  const activeVariant =
    variants.find((v) => v.pack_size === selectedSize) || variants[0];
  const currentPrice = activeVariant.price;
  const currentLink = activeVariant.product_link || product.product_link;

  const ingredientBadges = parseIngredients(product.active);

  return (
    <Card
      flush
      className={`flex flex-col p-3 transition-shadow ${
        selected ? "ring-2 ring-brand" : ""
      }`}
    >
      <div className="flex gap-3.5">
        <div className="relative aspect-square w-[28%] max-w-28 shrink-0 self-start overflow-hidden rounded-lg">
          <Thumbnail
            src={product.image}
            alt={`${product.brand} ${product.name}`}
            sizes="(min-width: 1280px) 8vw, (min-width: 768px) 12vw, 28vw"
          />
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          {/* Brand & Format */}
          <div className="flex items-center justify-between gap-1">
            <p className="text-[0.75rem] font-semibold tracking-widest text-gray-500 uppercase">
              {product.brand}
            </p>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 uppercase">
              {product.format}
            </span>
          </div>

          <h3 className="mt-0.5 text-[0.9375rem] font-semibold text-ink">
            {product.name}
          </h3>

          {/* PK. SIZE DROPDOWN */}
          <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-600">
            <label
              htmlFor={`pack-size-${product.id}`}
              className="shrink-0 font-medium text-gray-500"
            >
              Pk. Size :
            </label>
            <select
              id={`pack-size-${product.id}`}
              value={selectedSize}
              onChange={(e) => onSizeChange(e.target.value)}
              className="rounded border border-line bg-white px-2 py-0.5 text-xs font-semibold text-ink outline-none focus:border-brand"
            >
              {variants.map((v) => (
                <option key={v.pack_size} value={v.pack_size}>
                  {v.pack_size}
                </option>
              ))}
            </select>
          </div>

          {/* ACTIVE INGREDIENTS */}
          {ingredientBadges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ingredientBadges.map((ing, idx) => (
                <span
                  key={idx}
                  className="rounded border border-line bg-[#f5f6f5] px-1.5 py-0.5 text-xs font-medium  text-gray-700"
                >
                  {ing}
                </span>
              ))}
            </div>
          )}

          {/* CLAIMS */}
          {product.claims && product.claims.length > 0 && (
            <ul className="mt-2 space-y-1">
              {product.claims.map((c, idx) => (
                <li key={idx} className="flex items-start gap-1.5 text-xs text-gray-600">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-brand" />
                  <span className="leading-tight">{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div aria-hidden className="min-h-3.5 flex-1" />

      {/* BOTTOM ROW: Dynamic Price, Product Link & Compare Button */}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex items-center gap-2.5">
          <span className="font-heading text-lg font-semibold text-ink tabular-nums">
            ₹{currentPrice}
          </span>

          {currentLink && currentLink !== "#" ? (
            <a
              href={currentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              title="Open product link"
            >
              <span>Product Link</span>
              <ExternalLink className="size-3" />
            </a>
          ) : (
            <span className="text-xs text-gray-400">No link</span>
          )}
        </div>

        <button
          type="button"
          aria-pressed={selected}
          disabled={full}
          title={full ? `You can compare up to ${MAX_COMPARE} products` : undefined}
          onClick={() => onToggleCompare(product.id)}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.875rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            selected
              ? "border border-brand bg-brand-soft text-brand"
              : "bg-brand text-white hover:bg-brand/90"
          }`}
        >
          {selected && <Check className="size-3.5" />}
          {selected ? "Comparing" : "Compare"}
        </button>
      </div>
    </Card>
  );
}

function AddProductForm({
  onAdd,
  onCancel,
}: {
  onAdd: (product: ExtendedProduct) => Promise<void>;
  onCancel: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();

    const productPayload: ExtendedProduct = {
      id: crypto.randomUUID(),
      brand: text("brand"),
      name: text("name"),
      active: text("active"),
      format: text("format"),
      claims: text("claims")
        .split(/[\n,]/)
        .map((c) => c.trim())
        .filter(Boolean),
      price: Number(text("price")),
      image: "/pl1.jpg",
      product_link: text("product_link"),
      pack_size: text("pack_size") || "Standard",
      variants: [
        {
          pack_size: text("pack_size") || "Standard",
          price: Number(text("price")),
          product_link: text("product_link"),
        },
      ],
    };

    try {
      await onAdd(productPayload);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input name="brand" required placeholder="Brand (e.g. Good Knight)" aria-label="Brand" className={inputClass} />
        <input name="name" required placeholder="Product name" aria-label="Product name" className={inputClass} />
        <input name="active" required placeholder="Active (e.g. Prallethrin 0.1%)" aria-label="Active ingredient" className={inputClass} />
        <select name="format" aria-label="Format" className={inputClass}>
          {formats.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <input name="pack_size" placeholder="Pack Size (e.g. 200ml, 45N)" aria-label="Pack size" className={inputClass} />
        <input name="price" type="number" min={0} required placeholder="Price (₹)" aria-label="Price in rupees" className={inputClass} />
        <input name="product_link" placeholder="Product Link (URL)" aria-label="Product Link" className={inputClass} />
        <input name="claims" placeholder="Claims (newline or comma separated)" aria-label="Claims" className={inputClass} />
        <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="rounded-lg border border-line px-4 py-2 text-[0.9375rem] text-ink hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-brand px-4 py-2 text-[0.9375rem] font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {submitting ? "Adding..." : "Add product"}
          </button>
        </div>
      </form>
    </Card>
  );
}

// Compare table synchronized with selected pack size and live prices
function CompareTable({
  products,
  selectedSizes,
  onRemove,
  onClear,
}: {
  products: ExtendedProduct[];
  selectedSizes: Record<string, string>;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="text-[0.9375rem] font-semibold text-ink">
          Comparing {products.length} products
        </h2>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-semibold text-brand hover:underline"
        >
          Clear
        </button>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-lg text-xs">
          <thead>
            <tr className="border-b border-line">
              <th className="w-24 py-2.5 text-left font-medium text-gray-500" />
              {products.map((p) => (
                <th key={p.id} className="py-2.5 pr-4 text-left font-semibold text-ink">
                  <span className="inline-flex items-center gap-1.5">
                    {p.name}
                    <button
                      type="button"
                      aria-label={`Remove ${p.brand} ${p.name} from comparison`}
                      onClick={() => onRemove(p.id)}
                      className="text-gray-400 hover:text-ink"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {/* Brand Row */}
            <tr>
              <th scope="row" className="py-2.5 text-left font-medium text-gray-500">
                Brand
              </th>
              {products.map((p) => (
                <td key={p.id} className="py-2.5 pr-4 text-ink font-medium">
                  {p.brand}
                </td>
              ))}
            </tr>

            {/* Pack Size Row */}
            <tr>
              <th scope="row" className="py-2.5 text-left font-medium text-gray-500">
                Pack Size
              </th>
              {products.map((p) => {
                const currentSize =
                  selectedSizes[p.id] ||
                  (p.variants && p.variants[0]?.pack_size) ||
                  p.pack_size ||
                  "Standard";
                return (
                  <td key={p.id} className="py-2.5 pr-4 font-semibold text-ink">
                    <span className="rounded bg-brand/10 px-2 py-0.5 text-brand font-medium">
                      {currentSize}
                    </span>
                  </td>
                );
              })}
            </tr>

            {/* Active Ingredients Row */}
            <tr>
              <th scope="row" className="py-2.5 text-left font-medium text-gray-500 align-top">
                Active
              </th>
              {products.map((p) => {
                const actives = parseIngredients(p.active);
                return (
                  <td key={p.id} className="py-2.5 pr-4 align-top">
                    <div className="flex flex-col gap-1">
                      {actives.map((item, idx) => (
                        <span
                          key={idx}
                          className="inline-block w-fit rounded border border-line bg-[#f5f6f5] px-1.5 py-0.5 text-[0.75rem] text-gray-700"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Format Row */}
            <tr>
              <th scope="row" className="py-2.5 text-left font-medium text-gray-500">
                Format
              </th>
              {products.map((p) => (
                <td key={p.id} className="py-2.5 pr-4 text-ink">
                  {p.format}
                </td>
              ))}
            </tr>

            {/* Live Synced Price Row */}
            <tr>
              <th scope="row" className="py-2.5 text-left font-medium text-gray-500">
                Price
              </th>
              {products.map((p) => {
                const currentSize = selectedSizes[p.id];
                const matchedVariant = p.variants?.find((v) => v.pack_size === currentSize);
                const displayPrice = matchedVariant ? matchedVariant.price : p.price;
                return (
                  <td key={p.id} className="py-2.5 pr-4 font-semibold text-ink tabular-nums text-sm">
                    ₹{displayPrice}
                  </td>
                );
              })}
            </tr>

            {/* Claims Row: Vertical Bullet Points */}
            <tr>
              <th scope="row" className="py-2.5 text-left font-medium text-gray-500 align-top">
                Claims
              </th>
              {products.map((p) => (
                <td key={p.id} className="py-2.5 pr-4 align-top">
                  {p.claims && p.claims.length > 0 ? (
                    <ul className="space-y-1.5">
                      {p.claims.map((claim, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs text-gray-600">
                          <span className="mt-1 size-1 shrink-0 rounded-full bg-brand" />
                          <span className="leading-tight">{claim}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function useProductLibrary(initialProducts: Product[]) {
  const [products, setProducts] = useState<ExtendedProduct[]>(initialProducts);
  const [compare, setCompare] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function loadProducts() {
      try {
        const data = await clientFetch<any[]>("/api/competitor/products");
        if (!ignore && Array.isArray(data) && data.length > 0) {
          setProducts(data.map(mapDbProductToClient));
        }
      } catch (err) {
        console.warn("Falling back to local initial products:", err);
      }
    }
    loadProducts();
    return () => {
      ignore = true;
    };
  }, []);

  function toggleCompare(id: string) {
    setCompare((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < MAX_COMPARE
          ? [...prev, id]
          : prev,
    );
  }

  return { products, setProducts, compare, setCompare, adding, setAdding, toggleCompare };
}

export type ProductLibraryState = ReturnType<typeof useProductLibrary>;

export function LibraryCount({ library }: { library: ProductLibraryState }) {
  return (
    <p className="text-[0.8125rem] font-semibold tracking-widest text-gray-500 uppercase">
      {library.products.length} SKUs · {library.compare.length}/{MAX_COMPARE} selected for
      compare
    </p>
  );
}

export function AddProductButton({ library }: { library: ProductLibraryState }) {
  return (
    <button
      type="button"
      aria-expanded={library.adding}
      onClick={() => library.setAdding((v) => !v)}
      className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand/90"
    >
      <Plus className="size-3.5" />
      Add Product
    </button>
  );
}

export function ProductLibrary({ library }: { library: ProductLibraryState }) {
  const { products, setProducts, compare, setCompare, adding, setAdding, toggleCompare } = library;

  // Selected pack sizes across all products to keep table and cards in sync
  const [selectedSizes, setSelectedSizes] = useState<Record<string, string>>({});

  const compared = compare
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is ExtendedProduct => p !== undefined);

  function handleSizeChange(productId: string, size: string) {
    setSelectedSizes((prev) => ({
      ...prev,
      [productId]: size,
    }));
  }

  async function handleAddProduct(product: ExtendedProduct) {
    try {
      const saved = await clientFetch<any>("/api/competitor/products", {
        method: "POST",
        body: JSON.stringify({
          brand: product.brand,
          name: product.name,
          active_ingredient: product.active,
          format: product.format,
          price: product.price,
          currency: "INR",
          claims: product.claims,
          image_url: product.image,
          product_link: product.product_link,
          pack_size: product.pack_size,
        }),
      });
      const clientProduct = mapDbProductToClient(saved);
      setProducts((prev) => [clientProduct, ...prev]);
    } catch (err) {
      console.error("Failed to save product to DB, adding locally:", err);
      setProducts((prev) => [product, ...prev]);
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      {adding && (
        <AddProductForm
          onAdd={handleAddProduct}
          onCancel={() => setAdding(false)}
        />
      )}

      {compared.length >= 2 && (
        <CompareTable
          products={compared}
          selectedSizes={selectedSizes}
          onRemove={toggleCompare}
          onClear={() => setCompare([])}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((p) => {
          const selected = compare.includes(p.id);
          const full = !selected && compare.length >= MAX_COMPARE;
          const currentSize =
            selectedSizes[p.id] ||
            (p.variants && p.variants[0]?.pack_size) ||
            p.pack_size ||
            "Standard";

          return (
            <ProductCard
              key={p.id}
              product={p}
              selected={selected}
              full={full}
              selectedSize={currentSize}
              onSizeChange={(size) => handleSizeChange(p.id, size)}
              onToggleCompare={toggleCompare}
            />
          );
        })}
      </div>
    </>
  );
}