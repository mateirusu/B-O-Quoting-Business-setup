// @ts-nocheck — Deno runtime; VS Code TS checker doesn't understand Deno globals
// ─── Supplier Parsers ────────────────────────────────────────────────────────
// Add a new entry to PARSERS for each supplier you want to support.
// Each parser receives:
//   html        – fully rendered page HTML from Zyte (browserHtml)
//   zyteProduct – Zyte's automatic product extraction object (may be null)
//   url         – the original product URL
// and returns { name, price, code, supplier }.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductData {
  name: string | null;
  price: number | null;
  code: string | null;
  supplier: string | null;
}

// ── Registry ─────────────────────────────────────────────────────────────────
// Key = hostname without "www."
const PARSERS: Record<string, (html: string, zyteProduct: any, url: string) => ProductData> = {
  "cef.co.uk": parseCef,
  // "tlc-direct.co.uk": parseTlc,   ← add future suppliers here
};

// ── Entry point ───────────────────────────────────────────────────────────────
export function parseProductData(
  url: string,
  html: string,
  zyteProduct: any
): ProductData {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const parser = PARSERS[hostname];
    return parser ? parser(html, zyteProduct, url) : parseGeneric(html, zyteProduct);
  } catch {
    return parseGeneric(html, zyteProduct);
  }
}

// ── CEF (cef.co.uk) ───────────────────────────────────────────────────────────
function parseCef(html: string, zyteProduct: any, _url: string): ProductData {
  const supplier = "CEF";

  // Name — prefer Zyte's ML extraction
  let name: string | null = zyteProduct?.name?.trim() ?? null;
  if (!name) {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    name = m?.[1]?.trim() ?? null;
  }

  // Price — CEF shows ex-VAT in data-testid="vat-price-secondary" (e.g. "£10.82 Ex VAT").
  // That is the correct value for base_price_no_vat.
  let price: number | null = null;

  const exVatMatch = html.match(
    /data-testid="vat-price-secondary"[^>]*>\s*£?([\d.]+)/
  );
  if (exVatMatch) {
    price = parseFloat(exVatMatch[1]) || null;
  }

  // Fallback to Zyte's automatic extraction (which returns inc-VAT — less ideal)
  if (price === null && zyteProduct?.price != null) {
    price = parseFloat(String(zyteProduct.price).replace(/[^0-9.]/g, "")) || null;
  }

  // Stock Code — two reliable sources in CEF's rendered HTML:
  // 1. Embedded React JSON block:  "stockCode":"1088-1877"
  // 2. Rendered element:           data-testid="stock-code" > <strong>1088-1877</strong>
  // NOTE: do NOT use JSON-LD "sku" — CEF puts the catalogue product number
  //       there (e.g. 1661731), which is NOT the stock code.
  let code: string | null = null;

  const jsonStockCode = html.match(/"stockCode"\s*:\s*"([^"]+)"/);
  if (jsonStockCode) code = jsonStockCode[1].trim();

  if (!code) {
    const domStockCode = html.match(
      /data-testid="stock-code"[\s\S]{0,200}?<strong[^>]*>([\d\-]+)<\/strong>/
    );
    if (domStockCode) code = domStockCode[1].trim();
  }

  return { name, price, code, supplier };
}

// ── Generic fallback (used for unknown suppliers) ─────────────────────────────
export function parseGeneric(html: string, zyteProduct: any): ProductData {
  let name: string | null = zyteProduct?.name?.trim() ?? null;
  let price: number | null =
    zyteProduct?.price != null
      ? parseFloat(String(zyteProduct.price).replace(/[^0-9.]/g, "")) || null
      : null;

  // Schema.org JSON-LD
  const jsonLdRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(jsonLdRe)) {
    try {
      const items: any[] = ([] as any[]).concat(JSON.parse(m[1]));
      for (const item of items) {
        if (item["@type"] === "Product") {
          name = name ?? item.name ?? null;
          const rawOffers = item.offers;
          if (rawOffers && price === null) {
            const offer = Array.isArray(rawOffers) ? rawOffers[0] : rawOffers;
            price = parseFloat(String(offer.price ?? offer.lowPrice ?? "")) || null;
          }
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  }

  // Open Graph / product meta tags
  if (!name) {
    const m =
      html.match(/property=["']og:title["'][^>]*content=["']([^"']+)["']/) ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:title["']/);
    name = m?.[1]?.trim() ?? null;
  }
  if (price === null) {
    const m =
      html.match(/property=["']og:price:amount["'][^>]*content=["']([^"']+)["']/) ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']og:price:amount["']/) ||
      html.match(/property=["']product:price:amount["'][^>]*content=["']([^"']+)["']/) ||
      html.match(/content=["']([^"']+)["'][^>]*property=["']product:price:amount["']/);
    if (m) price = parseFloat(m[1].replace(/[^0-9.]/g, "")) || null;
  }

  // Page title as last-resort name
  if (!name) {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    name = m?.[1]?.trim() ?? null;
  }

  return { name, price, code: null, supplier: null };
}
