// News Article 1 - RSS fetcher. Produces news.json for index.html
import Parser from "rss-parser";
import fs from "node:fs";

const feeds = JSON.parse(fs.readFileSync("feeds.json", "utf8"));
const MAX_AGE_MS = 3 * 24 * 3600 * 1000; // keep 3 days of news
const MAX_ITEMS = 400;
const PER_FEED = 15;

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "Mozilla/5.0 (NewsArticle1Bot)" },
  customFields: { item: [["media:content", "mediaContent"], ["media:thumbnail", "mediaThumb"]] },
});

// Keyword based category guess for general feeds (cat: "auto")
const KW = {
  sports: ["cricket|match|psl|t20|football|hockey|tennis|olympic", ["کرکٹ", "میچ", "کھلاڑی", "ہاکی", "فٹبال", "فٹ بال"]],
  ent: ["film|movie|drama|actor|actress|singer|music|celebrity", ["فلم", "ڈرامہ", "ڈرامے", "اداکار", "گلوکار", "شوبز"]],
  biz: ["stock|rupee|inflation|budget|economy|bank|price", ["اسٹاک", "روپے", "مہنگائی", "بجٹ", "معیشت", "قیمت"]],
  tech: ["tech|mobile|internet|software|cyber|smartphone|\\bai\\b", ["ٹیکنالوجی", "انٹرنیٹ", "موبائل", "مصنوعی ذہانت"]],
  health: ["health|hospital|disease|doctor|virus|dengue", ["صحت", "ہسپتال", "ڈاکٹر", "بیماری", "ڈینگی"]],
  edu: ["school|university|exam|students|scholarship", ["تعلیم", "اسکول", "یونیورسٹی", "امتحان", "طلبہ"]],
  intl: ["\\bus\\b|usa|india|china|iran|israel|gaza|ukraine|russia|world|global", ["امریکا", "امریکہ", "بھارت", "چین", "ایران", "اسرائیل", "غزہ", "روس", "عالمی"]],
};
function classify(text, fallback) {
  for (const [cat, [en, ur]] of Object.entries(KW)) {
    if (new RegExp(en, "i").test(text) || ur.some((w) => text.includes(w))) return cat;
  }
  return fallback || "pakistan";
}

function clean(s = "") {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ").trim();
}

function pickImage(it) {
  let u = "";
  if (it.enclosure?.url && (!it.enclosure.type || it.enclosure.type.startsWith("image"))) u = it.enclosure.url;
  u = u || it.mediaContent?.$?.url || it.mediaThumb?.$?.url ||
    (it["content:encoded"] || it.content || "").match(/<img[^>]+src=["']([^"']+)/i)?.[1] || "";
  return /^https?:\/\//.test(u) ? u : "";
}

const titleKey = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

let old = [];
try { old = JSON.parse(fs.readFileSync("news.json", "utf8")).items || []; } catch {}

const fresh = [];
for (const f of feeds) {
  try {
    const r = await parser.parseURL(f.url);
    let n = 0;
    for (const it of r.items.slice(0, PER_FEED)) {
      const title = clean(it.title);
      const url = (it.link || "").split("#")[0];
      if (!title || !url) continue;
      let d = new Date(it.isoDate || it.pubDate || Date.now());
      if (isNaN(d) || d > Date.now()) d = new Date();
      const summary = clean(it.contentSnippet || it.summary || it.content || "").slice(0, 200);
      const cat = f.cat === "auto" ? classify(title + " " + summary, f.fallback) : f.cat;
      fresh.push({ cat, title, summary, source: f.source, url, image: pickImage(it), lang: f.lang, date: d.toISOString() });
      n++;
    }
    console.log("OK  ", f.source, f.url, n);
  } catch (e) {
    console.log("FAIL", f.url, "-", e.message); // one broken feed never stops the others
  }
}

// merge new + old, remove duplicates and expired items
const seenUrl = new Set(), seenTitle = new Set(), out = [];
for (const it of [...fresh, ...old]) {
  if (Date.now() - new Date(it.date) > MAX_AGE_MS) continue;
  const tk = titleKey(it.title);
  if (seenUrl.has(it.url) || seenTitle.has(tk)) continue;
  seenUrl.add(it.url); seenTitle.add(tk); out.push(it);
}
out.sort((a, b) => new Date(b.date) - new Date(a.date));
fs.writeFileSync("news.json", JSON.stringify({ updated: new Date().toISOString(), items: out.slice(0, MAX_ITEMS) }));
console.log("Saved", Math.min(out.length, MAX_ITEMS), "items");
