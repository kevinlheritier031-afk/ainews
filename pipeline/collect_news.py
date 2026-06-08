import json
import os
import sys
import logging
from datetime import datetime, timezone
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
    summary: str            # Résumé complet EN FRANÇAIS UNIQUEMENT : 6-10 phrases couvrant ce que c'est, pourquoi c'est important, détails techniques, impact écosystème
    code_example: str       # snippet Python/bash en markdown (réel et fonctionnel)
    source_url: str
    importance_score: int   # 1-10 : pertinence et impact dans l'écosystème IA


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
    """Charge les sources actives depuis Supabase. Fallback sur liste statique si vide."""
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
                params={
                    "query":          keyword,
                    "tags":           "story",
                    "numericFilters": "points>50",
                    "hitsPerPage":    4,
                },
                timeout=10,
            )
            resp.raise_for_status()
            hits = resp.json().get("hits", [])
            for hit in hits:
                url = hit.get("url") or (
                    f"https://news.ycombinator.com/item?id={hit.get('objectID', '')}"
                )
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


# ── Gemini ────────────────────────────────────────────────────────────────────

def _build_prompt(articles: list[dict]) -> str:
    lines = [
        "Tu es un expert en IA/ML. Analyse ces articles et sélectionne les 5 à 8 MEILLEURS représentant "
        "le signal technique le plus fort (nouveaux modèles, frameworks, papiers de recherche). "
        "Ignore le marketing sans substance et les doublons. Qualité > quantité.",
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
        "     (ex: créer un agent qui..., fine-tuner un modèle pour..., intégrer dans...)",
        "  6. L'impact potentiel sur l'écosystème IA à court terme",
        "  Le lecteur doit TOUT comprendre et SAVOIR QUOI EN FAIRE sans lire l'article.",
        "- code_example: snippet Python ou bash RÉEL et fonctionnel en markdown",
        "- source_url: URL originale de l'article",
        "- importance_score: entier 1 à 10 selon l'impact réel dans l'écosystème IA :",
        "    10 = percée majeure (GPT-4, AlphaFold, nouveau modèle frontier)",
        "    8-9 = annonce importante (nouveau modèle open-source performant, API majeure)",
        "    6-7 = information utile (benchmark, fine-tuning, framework notable)",
        "    4-5 = contenu technique mineur",
        "    1-3 = marketing ou faible signal",
        "",
        "ARTICLES :",
        "",
    ]
    for i, a in enumerate(articles, 1):
        lines.append(f"[{i}] {a['source']} | {a['title']}")
        lines.append(f"    URL: {a['url']}")
        if a.get("snippet"):
            lines.append(f"    Extrait: {a['snippet']}")
        lines.append("")
    return "\n".join(lines)


def analyze(articles: list[dict]) -> Optional[NewsCollection]:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY not set")
        return None

    client = genai.Client(api_key=api_key)
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=_build_prompt(articles),
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
        # Si la colonne importance_score n'existe pas encore, on réessaie sans elle
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


def upsert(collection: NewsCollection) -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        logger.error("SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
        return 0

    db: Client = create_client(url, key)
    inserted = 0

    # Trier par importance décroissante pour afficher le plus pertinent en premier
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

    rss_articles = fetch_rss()
    hn_articles = fetch_hn()
    articles = rss_articles + hn_articles
    logger.info("Total articles collected: %d (RSS: %d, HN: %d)",
                len(articles), len(rss_articles), len(hn_articles))

    if not articles:
        logger.error("No articles collected — aborting")
        sys.exit(1)

    collection = analyze(articles)
    if collection is None or not collection.items:
        logger.error("Gemini returned no items — aborting")
        sys.exit(1)

    count = upsert(collection)
    logger.info("=== Pipeline complete: %d/%d items upserted ===", count, len(collection.items))


if __name__ == "__main__":
    main()
