import { NextRequest, NextResponse } from "next/server";

const FBCLM_MATCH = /https?:\/\/(?:www\.)?fbclm\.net\/pagina-de-partido\/\?[^\s\"'<>]*?\bid=(\d+)/gi;

const cleanSearchHtml = (value: string) => value
  .replaceAll("&amp;", "&")
  .replaceAll("\\u003d", "=")
  .replaceAll("\\u0026", "&")
  .replaceAll("%3F", "?")
  .replaceAll("%3D", "=")
  .replaceAll("%26", "&");

const officialMatchUrls = (html: string) => {
  const urls = new Set<string>();
  for (const match of cleanSearchHtml(html).matchAll(FBCLM_MATCH)) {
    urls.add(`https://fbclm.net/pagina-de-partido/?id=${match[1]}`);
  }
  return [...urls];
};

const searchPage = async (url: string) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; RefFlow/1.0; +https://refflow.app)" },
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    return response.ok ? await response.text() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const matchNumber = (params.get("number") || "").replace(/\D/g, "").slice(0, 10);
  const home = (params.get("home") || "").trim().slice(0, 100);
  const away = (params.get("away") || "").trim().slice(0, 100);
  const date = (params.get("date") || "").trim().slice(0, 10);
  if (!matchNumber || !home || !away) return NextResponse.json({ found: false }, { status: 400 });

  const displayDate = date.match(/^(\d{4})-(\d{2})-(\d{2})$/)?.slice(1).reverse().join("/") || date;
  const queries = [
    `site:fbclm.net/pagina-de-partido/ "${matchNumber}" "${home}" "${away}"`,
    `site:fbclm.net/pagina-de-partido/ "${home}" "${away}" "${displayDate}"`,
  ];
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(queries[0])}`;
  const pages = await Promise.all(queries.flatMap((query) => {
    const encoded = encodeURIComponent(query);
    return [
      searchPage(`https://www.google.com/search?q=${encoded}&num=10&hl=es`),
      searchPage(`https://www.bing.com/search?format=rss&q=${encoded}`),
    ];
  }));
  const url = pages.flatMap(officialMatchUrls)[0];
  return NextResponse.json({ found: Boolean(url), url, searchUrl }, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
