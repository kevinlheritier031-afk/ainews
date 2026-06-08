import json
import os
import sys
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import feedparser
import requests
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pydantic import BaseModel
from supabase import create_client, Client

load_dotenv()


# ── Logging ──────────────────────────────────────────────────────────────────

class _UTCFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):  # noqa: N802
        return datetime.fromtimestamp(record.created, tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
    def format(self, record):
        record.levelname = f"{record.levelname:<8}"
        return super().format(record)

import io as _io
_handler = logging.StreamHandler(_io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace'))
_handler.setFormatter(_UTCFormatter("[%(asctime)s] %(levelname)s %(message)s"))
logger = logging.getLogger(__name__)
logger.addHandler(_handler)
logger.setLevel(logging.INFO)


# ── Pydantic models ───────────────────────────────────────────────────────────

class NewsItem(BaseModel):
    title: str
    category: str           # "Modèle" | "Framework" | "Recherche"
    summary: str            # Résumé complet EN FRANÇAIS UNIQUEMENT : 8-12 phrases
    code_example: str       # snippet Python/bash en markdown (réel et fonctionnel)
    source_url: str
    importance_score: int   # 1-10


class NewsCollection(BaseModel):
    items: list[NewsItem]   # 5 à 8 items


# ── Sources ───────────────────────────────────────────────────────────────────

FALLBACK_FEEDS: list[tuple[str, str]] = [
    ("HuggingFace Daily Papers", "https://huggingface.co/papers/rss"),
    ("OpenAI Blog",              "https://openai.com/news/rss.xml"),
    ("Anthropic Blog",           "https://www.anthropic.com/news/rss"),
    ("Google DeepMind",          "https://deepmind.google/blog/rss/"),
    ("arXiv AI",                 "https://export.arxiv.org/rss/cs.AI"),
    ("arXiv Machine Learning",   "https://export.arxiv.org/rss/cs.LG"),
    ("arXiv NLP",                "https://export.arxiv.org/rss/cs.CL"),
    ("VentureBeat AI",           "https://feeds.feedburner.com/venturebeat/SZYF"),
    ("MIT Tech Review AI",       "https://www.technologyreview.com/feed/"),
]

def load_sources_from_db() -> list[tuple[str, str]]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        return FALLBACK_FEEDS
    try:
        db: Client = create_client(url, key)
        result = db.table("ai_sources").select("name, rss_url").eq("active", True).execute()
        rows = result.data or []
        if not rows:
            logger.info("ai_sources table empty — using fallback feeds")
            return FALLBACK_FEEDS
        feeds = [(r["name"], r["rss_url"]) for r in rows]
        logger.info("Loaded %d sources from Supabase", len(feeds))
        return feeds
    except Exception as exc:
        logger.warning("Could not load sources from DB: %s — using fallback", exc)
        return FALLBACK_FEEDS

HN_KEYWORDS: list[str] = [
    "LLM", "GPT", "Claude", "Gemini", "transformer",
    "RAG", "AI agent", "fine-tuning", "open source model",
    "diffusion model", "multimodal", "reasoning model",
]

HN_API = "https://hn.algolia.com/api/v1/search"


# ── Fetchers ──────────────────────────────────────────────────────────────────

def fetch_rss() -> list[dict]:
    articles: list[dict] = []
    rss_feeds = load_sources_from_db()
    for name, url in rss_feeds:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:5]:
                articles.append({
                    "source":  name,
                    "title":   entry.get("title", ""),
                    "url":     entry.get("link", ""),
                    "snippet": entry.get("summary", entry.get("description", ""))[:400],
                })
            logger.info("RSS [%s]: %d articles", name, len(feed.entries[:5]))
        except Exception as exc:
            logger.error("RSS [%s] failed: %s", name, exc)
    return articles


def fetch_hn() -> list[dict]:
    articles: list[dict] = []
    seen: set[str] = set()
    for keyword in HN_KEYWORDS:
        try:
            resp = requests.get(
                HN_API,
                params={"query": keyword, "tags": "story", "numericFilters": "points>50", "hitsPerPage": 4},
                timeout=10,
            )
            resp.raise_for_status()
            for hit in resp.json().get("hits", []):
                url = hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}"
                if url in seen:
                    continue
                seen.add(url)
                articles.append({
                    "source":  "Hacker News",
                    "title":   hit.get("title", ""),
                    "url":     url,
                    "snippet": f"Points: {hit.get('points', 0)}, Comments: {hit.get('num_comments', 0)}",
                })
        except Exception as exc:
            logger.error("HN [%s] failed: %s", keyword, exc)
    return articles


# ── Intelligence : dédup + contexte mémoire + tendances ──────────────────────

def deduplicate_articles(articles: list[dict]) -> list[dict]:
    """Fusionne les articles avec la même URL, note ceux couverts par plusieurs sources."""
    url_map: dict[str, dict] = {}
    for a in articles:
        url = a["url"]
        if not url:
            continue
        if url not in url_map:
            url_map[url] = {**a, "sources": [a["source"]], "source_count": 1}
        else:
            if a["source"] not in url_map[url]["sources"]:
                url_map[url]["sources"].append(a["source"])
                url_map[url]["source_count"] += 1

    result = list(url_map.values())
    multi = sum(1 for a in result if a["source_count"] > 1)
    logger.info("Dedup: %d -> %d articles (%d multi-sources)", len(articles), len(result), multi)
    return result


def load_context(db: Client) -> dict:
    """Charge mémoire 24h + tendances 7 jours depuis Supabase."""
    try:
        cutoff_24h = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        cutoff_7d  = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

        recent = db.table("ai_news").select("title").gte("created_at", cutoff_24h).execute()
        recent_titles = [r["title"] for r in (recent.data or [])]

        week = db.table("ai_news").select("category").gte("created_at", cutoff_7d).execute()
        counts: dict[str, int] = {}
        for r in (week.data or []):
            counts[r["category"]] = counts.get(r["category"], 0) + 1

        logger.info("Context: %d titres recents, tendances 7j: %s", len(recent_titles), counts)
        return {"recent_titles": recent_titles, "category_counts": counts}
    except Exception as exc:
        logger.warning("Context load failed: %s", exc)
        return {"recent_titles": [], "category_counts": {}}


# ── Gemini ────────────────────────────────────────────────────────────────────

def _build_prompt(articles: list[dict], context: dict) -> str:
    recent_titles   = context.get("recent_titles", [])
    category_counts = context.get("category_counts", {})

    lines = [
        "Tu es un expert en IA/ML. Analyse ces articles et sélectionne les 5 à 8 MEILLEURS représentant "
        "le signal technique le plus fort (nouveaux modèles, frameworks, papiers de recherche). "
        "Ignore le marketing sans substance. Qualité > quantité.",
        "",
        "Pour chaque article sélectionné, génère :",
        "- title: titre concis et technique EN FRANÇAIS",
        "- category: exactement 'Modèle', 'Framework' ou 'Recherche'",
        "- summary: RÉSUMÉ COMPLET EN FRANÇAIS UNIQUEMENT (jamais en anglais). 8 à 12 phrases",
        "  couvrant dans l'ordre :",
        "  1. Ce que c'est exactement (nature de l'annonce/découverte)",
        "  2. Le contexte et pourquoi c'est notable maintenant",
        "  3. Les détails techniques clés (architecture, taille, performances, benchmarks...)",
        "  4. Ce que ça change concrètement pour les développeurs et chercheurs",
        "  5. 2 ou 3 exemples pratiques concrets : 'Avec ça, tu peux maintenant...'",
        "  6. L'impact potentiel sur l'écosystème IA à court terme",
        "- code_example: snippet Python ou bash RÉEL et fonctionnel en markdown",
        "- source_url: URL originale de l'article",
        "- importance_score: entier 1 à 10 :",
        "    10 = percée majeure  |  8-9 = annonce importante  |  6-7 = utile  |  1-5 = faible signal",
        "    +1 bonus si l'article est couvert par plusieurs sources (signal confirmé)",
        "",
    ]

    # Mémoire inter-runs
    if recent_titles:
        lines.append("SUJETS DEJA COUVERTS CES 24 DERNIERES HEURES — ne pas répéter sauf si développement majeur :")
        for t in recent_titles[:20]:
            lines.append(f"  - {t}")
        lines.append("")

    # Tendances de la semaine
    if category_counts:
        total = sum(category_counts.values()) or 1
        lines.append("TENDANCES DE LA SEMAINE (équilibre les catégories sous-représentées) :")
        for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
            pct = 100 * count // total
            lines.append(f"  - {cat}: {count} articles cette semaine ({pct}%)")
        lines.append("")

    lines += ["ARTICLES :", ""]

    for i, a in enumerate(articles, 1):
        sc = a.get("source_count", 1)
        sources = a.get("sources", [a["source"]])
        src_tag = f"[{sc} SOURCES: {', '.join(sources)}]" if sc > 1 else a["source"]
        lines.append(f"[{i}] {src_tag} | {a['title']}")
        lines.append(f"    URL: {a['url']}")
        if a.get("snippet"):
            lines.append(f"    Extrait: {a['snippet']}")
        lines.append("")

    return "\n".join(lines)


def analyze(articles: list[dict], context: dict) -> Optional[NewsCollection]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY not set")
        return None

    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=_build_prompt(articles, context),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=NewsCollection,
                temperature=0.2,
                max_output_tokens=32768,
            ),
        )
        collection: NewsCollection = response.parsed
        if collection is None:
            collection = NewsCollection(**json.loads(response.text))
        logger.info("Gemini: %d items returned", len(collection.items))
        return collection
    except Exception as exc:
        logger.error("Gemini error: %s", exc)
        return None


# ── Supabase ──────────────────────────────────────────────────────────────────

_VALID_CATEGORIES = {"Modèle", "Framework", "Recherche"}


def _upsert_row(db: Client, row: dict) -> bool:
    try:
        db.table("ai_news").upsert(row, on_conflict="content_hash", ignore_duplicates=True).execute()
        return True
    except Exception as exc:
        err = str(exc)
        if "importance_score" in err or "column" in err.lower():
            row.pop("importance_score", None)
            try:
                db.table("ai_news").upsert(row, on_conflict="content_hash", ignore_duplicates=True).execute()
                return True
            except Exception as exc2:
                logger.error("Upsert failed (fallback): %s", exc2)
        else:
            logger.error("Upsert failed: %s", exc)
        return False


def upsert(collection: NewsCollection, db: Client) -> int:
    inserted = 0
    sorted_items = sorted(collection.items, key=lambda x: x.importance_score, reverse=True)

    for item in sorted_items:
        if item.category not in _VALID_CATEGORIES:
            logger.warning("Skipped invalid category '%s': %s", item.category, item.title[:50])
            continue

        row = {
            "title":            item.title,
            "category":         item.category,
            "summary":          item.summary,
            "code_example":     item.code_example,
            "source_url":       item.source_url,
            "importance_score": item.importance_score,
            "urgent":           item.importance_score >= 9,
        }

        if _upsert_row(db, row):
            inserted += 1
            flag = "[URGENT]" if item.importance_score >= 9 else ""
            logger.info("[%d/10] %s %s", item.importance_score, item.title[:60], flag)

    return inserted


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    logger.info("=== AI News Pipeline started ===")

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        logger.error("SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
        sys.exit(1)

    db = create_client(supabase_url, supabase_key)

    # Mémoire + tendances
    context = load_context(db)

    # Collecte
    rss_articles = fetch_rss()
    hn_articles  = fetch_hn()
    raw_articles = rss_articles + hn_articles
    logger.info("Collected: %d (RSS: %d, HN: %d)", len(raw_articles), len(rss_articles), len(hn_articles))

    if not raw_articles:
        logger.error("No articles collected — aborting")
        sys.exit(1)

    # Déduplication + corrélation multi-sources
    articles = deduplicate_articles(raw_articles)

    # Analyse Gemini avec contexte
    collection = analyze(articles, context)
    if collection is None or not collection.items:
        logger.error("Gemini returned no items — aborting")
        sys.exit(1)

    count = upsert(collection, db)
    logger.info("=== Pipeline complete: %d/%d items upserted ===", count, len(collection.items))


if __name__ == "__main__":
    main()
