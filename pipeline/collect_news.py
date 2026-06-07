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


_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(_UTCFormatter("[%(asctime)s] %(levelname)s %(message)s"))
logger = logging.getLogger(__name__)
logger.addHandler(_handler)
logger.setLevel(logging.INFO)


# ── Pydantic models ───────────────────────────────────────────────────────────

class NewsItem(BaseModel):
    title: str
    category: str          # "Modèle" | "Framework" | "Recherche"
    summary: str           # 2 phrases max, denses et techniques
    code_example: str      # snippet Python/bash en markdown
    source_url: str


class NewsCollection(BaseModel):
    items: list[NewsItem]  # 5 à 12 items


# ── Sources ───────────────────────────────────────────────────────────────────

RSS_FEEDS: list[tuple[str, str]] = [
    ("HuggingFace Daily Papers", "https://huggingface.co/papers/rss"),
    ("OpenAI Blog",              "https://openai.com/news/rss.xml"),
    ("Anthropic Blog",           "https://www.anthropic.com/news/rss"),
    ("Google DeepMind",          "https://deepmind.google/blog/rss/"),
]

HN_KEYWORDS: list[str] = [
    "LLM", "GPT", "Claude", "Gemini", "transformer",
    "RAG", "AI agent", "fine-tuning", "open source model",
]

HN_API = "https://hn.algolia.com/api/v1/search"


# ── Fetchers ──────────────────────────────────────────────────────────────────

def fetch_rss() -> list[dict]:
    articles: list[dict] = []
    for name, url in RSS_FEEDS:
        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:7]:
                articles.append({
                    "source":  name,
                    "title":   entry.get("title", ""),
                    "url":     entry.get("link", ""),
                    "snippet": entry.get("summary", entry.get("description", ""))[:300],
                })
            logger.info("RSS [%s]: %d articles", name, len(feed.entries[:7]))
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
                    "hitsPerPage":    5,
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
            logger.info("HN [%s]: %d hits", keyword, len(hits))
        except Exception as exc:
            logger.error("HN [%s] failed: %s", keyword, exc)
    return articles


# ── Gemini ────────────────────────────────────────────────────────────────────

def _build_prompt(articles: list[dict]) -> str:
    lines = [
        "Tu es un expert en IA et ML. Analyse ces articles et sélectionne 5 à 12 articles "
        "représentant le signal technique le plus fort (nouveaux modèles, frameworks open-source, "
        "papiers de recherche). Ignore le marketing sans substance technique et les doublons.",
        "",
        "Pour chaque article sélectionné, génère :",
        "- title: titre concis et technique",
        "- category: exactement 'Modèle', 'Framework' ou 'Recherche'",
        "- summary: 2 phrases max, denses et techniques, en français",
        "- code_example: snippet Python ou bash RÉEL en markdown (```python ou ```bash)",
        "- source_url: URL originale de l'article",
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
                max_output_tokens=16384,
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


def upsert(collection: NewsCollection) -> int:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        logger.error("SUPABASE_URL or SUPABASE_SERVICE_KEY not set")
        return 0

    db: Client = create_client(url, key)
    inserted = 0

    for item in collection.items:
        if item.category not in _VALID_CATEGORIES:
            logger.warning("Skipped invalid category '%s': %s", item.category, item.title[:50])
            continue
        try:
            db.table("ai_news").upsert(
                {
                    "title":        item.title,
                    "category":     item.category,
                    "summary":      item.summary,
                    "code_example": item.code_example,
                    "source_url":   item.source_url,
                },
                on_conflict="content_hash",
                ignore_duplicates=True,
            ).execute()
            inserted += 1
            logger.info("Upserted: %s", item.title[:60])
        except Exception as exc:
            logger.error("Upsert failed [%s]: %s", item.title[:40], exc)

    return inserted


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    logger.info("=== AI News Pipeline started ===")

    articles = fetch_rss() + fetch_hn()
    logger.info("Total articles collected: %d", len(articles))

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
