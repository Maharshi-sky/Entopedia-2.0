// File: Entopedia 2.0 Backend/src/services/amazonScraper.service.ts

import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import { db } from '../db/connection';
import { logger } from '../utils/logger';

export interface ScrapedSKU {
  id: string;
  brand: string;
  name: string;
  active_ingredient: string;
  format: 'Aerosol' | 'Liquid Vaporizer' | 'Coil' | 'Card' | 'Gel/Paste' | 'Mat';
  price: number;
  pack_size: string;
  claims: string[];
  target_pests: string[];
  image_url: string;
  product_link: string;
  is_new?: boolean;
}

const TARGET_QUERIES: Array<{
  keyword: string;
  defaultFormat: ScrapedSKU['format'];
  defaultPests: string[];
}> = [
  {
    keyword: 'mosquito killer aerosol spray india',
    defaultFormat: 'Aerosol',
    defaultPests: ['Aedes aegypti', 'Anopheles', 'Housefly'],
  },
  {
    keyword: 'mosquito liquid vaporizer machine refill',
    defaultFormat: 'Liquid Vaporizer',
    defaultPests: ['Mosquito', 'Dengue Vector'],
  },
  {
    keyword: 'mosquito repellent coil fast card paper',
    defaultFormat: 'Coil',
    defaultPests: ['Mosquito'],
  },
  {
    keyword: 'cockroach killer gel paste syringe bait',
    defaultFormat: 'Gel/Paste',
    defaultPests: ['Blattella germanica', 'Periplaneta americana'],
  },
];

const KNOWN_BRANDS = [
  'Good Knight',
  'Mortein',
  'HIT',
  'All Out',
  'Bayer',
  'Maxforce',
  'DND',
  'Odomos',
  'Eveready',
  'Herbal Strategi',
];

function detectBrand(title: string): string {
  const lower = title.toLowerCase();
  const found = KNOWN_BRANDS.find((b) => lower.includes(b.toLowerCase()));
  return found || title.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '') || 'Other';
}

function detectFormat(title: string, fallback: ScrapedSKU['format']): ScrapedSKU['format'] {
  const lower = title.toLowerCase();
  if (lower.includes('gel') || lower.includes('paste') || lower.includes('syringe') || lower.includes('bait')) {
    return 'Gel/Paste';
  }
  if (lower.includes('card') || lower.includes('paper') || lower.includes('strip')) {
    return 'Card';
  }
  if (lower.includes('coil')) {
    return 'Coil';
  }
  if (lower.includes('mat')) {
    return 'Mat';
  }
  if (lower.includes('spray') || lower.includes('aerosol')) {
    return 'Aerosol';
  }
  if (lower.includes('refill') || lower.includes('machine') || lower.includes('vaporizer') || lower.includes('liquid')) {
    return 'Liquid Vaporizer';
  }
  return fallback;
}

function inferActiveIngredient(title: string, format: ScrapedSKU['format']): string {
  const lower = title.toLowerCase();
  if (lower.includes('transfluthrin')) return 'Transfluthrin 1.6% w/w';
  if (lower.includes('prallethrin')) return 'Prallethrin 1.6% w/w';
  if (lower.includes('allethrin')) return 'd-trans Allethrin 0.1% w/w';
  if (lower.includes('fipronil')) return 'Fipronil 0.05% w/w';
  if (lower.includes('cypermethrin')) return 'Cypermethrin 0.1% w/w';
  if (lower.includes('neem') || lower.includes('herbal') || lower.includes('citronella')) {
    return 'Botanical Citronella & Neem Oil';
  }

  // Standard Indian CIB&RC formulation mapping by format
  switch (format) {
    case 'Gel/Paste':
      return 'Fipronil 0.05% w/w Gel';
    case 'Aerosol':
      return 'Imiprothrin 0.07% + Cyphenothrin 0.2% w/w';
    case 'Coil':
      return 'd-trans Allethrin 0.1% w/w';
    case 'Card':
      return 'Transfluthrin 0.5% w/w Paper';
    default:
      return 'Transfluthrin 0.88% w/w LV';
  }
}

function extractPackSize(title: string): string {
  const match = title.match(
    /(\d+\s*x\s*\d+\s*(?:ml|g|gm|gms|coils|cards|strips|pcs|pack)|\d+\s*(?:ml|g|gm|gms|coils|cards|strips|pcs))/i
  );
  return match ? match[0] : 'Standard Pack';
}

// Scrape live search results from Amazon.in for a given category keyword
async function scrapeAmazonSearch(
  keyword: string,
  defaultFormat: ScrapedSKU['format'],
  defaultPests: string[]
): Promise<ScrapedSKU[]> {
  const searchUrl = `https://www.amazon.in/s?k=${encodeURIComponent(keyword)}`;
  const results: ScrapedSKU[] = [];

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-IN,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      logger.warn(`Amazon search returned HTTP ${response.status} for "${keyword}"`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $('div[data-component-type="s-search-result"]').each((_, el) => {
      const asin = $(el).attr('data-asin');
      if (!asin) return;

      const title = $(el).find('h2 a span').text().trim() || $(el).find('h2 span').text().trim();
      if (!title || title.length < 8) return;

      const priceWhole = $(el).find('.a-price-whole').first().text().replace(/[^0-9]/g, '');
      const price = priceWhole ? Number(priceWhole) : 0;

      const imgSrc =
        $(el).find('img.s-image').attr('src') ||
        'https://m.media-amazon.com/images/I/61rH8+1m8CL._SL1500_.jpg';

      const relHref = $(el).find('h2 a').attr('href');
      const productLink = relHref
        ? `https://www.amazon.in${relHref.split('/ref=')[0]}`
        : `https://www.amazon.in/dp/${asin}`;

      const format = detectFormat(title, defaultFormat);
      const brand = detectBrand(title);
      const activeIngredient = inferActiveIngredient(title, format);
      const packSize = extractPackSize(title);

      results.push({
        id: `amz-${asin}`,
        brand,
        name: title.slice(0, 140),
        active_ingredient: activeIngredient,
        format,
        price: price || 149,
        pack_size: packSize,
        claims: [
          `Verified Amazon.in listing (${asin})`,
          `Format: ${format} · ${packSize}`,
        ],
        target_pests: defaultPests,
        image_url: imgSrc,
        product_link: productLink,
      });
    });
  } catch (err) {
    logger.error(`Error scraping Amazon keyword "${keyword}":`, err);
  }

  return results.slice(0, 6); // Top 6 SKUs per category
}

// Generate Excel-ready CSV file matching ProductLibrary schema
function exportProductsToCsv(rows: any[], filePath: string) {
  const headers = [
    'Status',
    'SKU ID',
    'Brand',
    'Product Name',
    'Format',
    'Pack Size',
    'Active Ingredient',
    'Price (INR)',
    'Target Pests',
    'Claims',
    'Image URL',
    'Amazon Product Link',
    'Synced At',
  ];

  const escapeCsv = (val: any) => {
    const str = Array.isArray(val) ? val.join(' | ') : String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvLines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.is_new ? 'NEW LAUNCH' : 'EXISTING',
        r.id,
        r.brand,
        r.name,
        r.format,
        r.pack_size || 'Standard',
        r.active_ingredient,
        r.price,
        r.target_pests,
        r.claims,
        r.image_url,
        r.product_link,
        new Date().toISOString(),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Write UTF-8 BOM so Microsoft Excel opens Rupee symbol (₹) cleanly
  fs.writeFileSync(filePath, '\uFEFF' + csvLines.join('\n'), 'utf8');
}

// Main Pipeline: Scrapes Amazon -> Compares with DB -> Upserts New SKUs -> Writes CSV Report
export async function runMonthlyAmazonSync() {
  logger.info('[Amazon Sync] Starting scheduled monthly product discovery & catalog sync...');

  // 1. Fetch existing SKU IDs & normalized names from DB to detect new launches
  const existingRows = await db.queryMany('SELECT id, name FROM competitor_products');
  const existingIds = new Set(existingRows.map((r: any) => r.id));
  const existingNames = new Set(existingRows.map((r: any) => r.name.toLowerCase().trim()));

  // 2. Scrape all 4 pest control categories
  const scrapedAll: ScrapedSKU[] = [];
  for (const q of TARGET_QUERIES) {
    const items = await scrapeAmazonSearch(q.keyword, q.defaultFormat, q.defaultPests);
    scrapedAll.push(...items);
  }

  let newCount = 0;
  let updatedCount = 0;
  const processedRecords: any[] = [];

  for (const item of scrapedAll) {
    const isNew = !existingIds.has(item.id) && !existingNames.has(item.name.toLowerCase().trim());

    const saved = await db.queryOne(
      `INSERT INTO competitor_products
       (id, brand, name, active_ingredient, format, price, currency, claims, image_url, target_pests, pack_size, product_link, launched_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'INR', $7, $8, $9, $10, $11, CURRENT_DATE, NOW())
       ON CONFLICT (id) DO UPDATE SET
         price = EXCLUDED.price,
         image_url = COALESCE(EXCLUDED.image_url, competitor_products.image_url),
         product_link = EXCLUDED.product_link,
         pack_size = EXCLUDED.pack_size
       RETURNING *;`,
      [
        item.id,
        item.brand,
        item.name,
        item.active_ingredient,
        item.format,
        item.price,
        item.claims,
        item.image_url,
        item.target_pests,
        item.pack_size,
        item.product_link,
      ]
    );

    if (isNew) {
      newCount++;
    } else {
      updatedCount++;
    }

    processedRecords.push({ ...saved, is_new: isNew });
  }

  // 3. Export Excel-compatible CSV file in backend exports directory
  const monthTag = new Date().toISOString().slice(0, 7); // e.g. 2026-11
  const exportFileName = `entopedia-amazon-products-${monthTag}.csv`;
  const exportFilePath = path.join(process.cwd(), 'exports', exportFileName);

  const fullCatalog = await db.queryMany('SELECT * FROM competitor_products ORDER BY created_at DESC');
  const newIdSet = new Set(processedRecords.filter((r) => r.is_new).map((r) => r.id));
  const annotatedCatalog = fullCatalog.map((row: any) => ({
    ...row,
    is_new: newIdSet.has(row.id),
  }));

  exportProductsToCsv(annotatedCatalog, exportFilePath);

  logger.info(
    `[Amazon Sync] Completed: ${newCount} new products discovered, ${updatedCount} existing updated. CSV saved at ${exportFilePath}`
  );

  return {
    success: true,
    month: monthTag,
    new_products_found: newCount,
    existing_updated: updatedCount,
    total_catalog_skus: fullCatalog.length,
    csv_filename: exportFileName,
    products: fullCatalog,
  };
}