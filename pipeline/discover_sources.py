"""
Agent autonome de découverte de sources IA.
Tourne toutes les 6h. Trouve, teste et évalue de nouveaux flux RSS.
Les sources validées sont ajoutées à Supabase pour enrichir le pipeline.
"""
import os
import sys
import json
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

# ── Logging ───────────────────────────────────────────────────────────────────

class _UTCFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        return datetime.fromtimestamp(record.created, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    def format(self, record):
        record.levelname = f"{record.levelname:<8}"
        return super().format(record)

import io
_h = logging.StreamHandler(io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace'))
_h.setFormatter(_UTCFormatter("[%(asctime)s] %(levelname)s %(message)s"))
logger = logging.getLogger(__name__)
logger.addHandler(_h)
logger.setLevel(logging.INFO)

# ── Modèles Pydantic ──────────────────────────────────────────────────────────

class SourceCandidate(BaseModel):
    name: str           # Nom lisible (ex: "Andrej Karpathy Blog")
    rss_url: str        # URL RSS testable
    domain: str         # ex: "karpathy.ai"
    rationale: str      # Pourquoi cette source est pertinente

class SourceList(BaseModel):
    sources: list[SourceCandidate]

class SourceEvaluation(BaseModel):
    quality_score: int      # 1-10 : qualité générale du contenu
    ai_focus_score: int     # 1-10 : focus sur l'IA/ML
    update_frequency: str   # "daily" | "weekly" | "monthly" | "irregular"
    verdict: str            # "add" | "reject"
    reason: str             # Explication courte

# ── Gemini ────────────────────────────────────────────────────────────────────

def _gemini_client() -> Optional[genai.Client]:
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        logger.error("GEMINI_API_KEY not set")
        return None
    return genai.Client(api_key=key)

def discover_candidates(existing_urls: set[str]) -> list[SourceCandidate]:
    """Demande à Gemini de suggérer de nouveaux flux RSS à tester."""
    client = _gemini_client()
    if not client:
        return []

    prompt = f"""
Tu es un expert en veille IA/ML. Donne-moi 25 nouvelles sources RSS de qualité
sur l'IA, le machine learning et la recherche en deep learning.

CRITÈRES :
- Sources actives (mis à jour au moins une fois par semaine)
- Contenu technique de qualité (pas du marketing)
- Diversité : labs, chercheurs indépendants, conférences, journaux académiques
- Inclure des blogs personnels de chercheurs reconnus
- Inclure des fils de conférences (NeurIPS, ICML, ICLR...)
- Inclure des newsletters techniques

SOURCES DÉJÀ CONNUES (à exclure) :
{chr(10).join(existing_urls) if existing_urls else "Aucune"}

Pour chaque source : nom lisible, URL RSS exacte et testable, domaine, raison d'inclusion.
"""
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SourceList,
                temperature=0.4,
                max_output_tokens=8192,
            ),
        )
        result: SourceList = response.parsed
        if result is None:
            result = SourceList(**json.loads(response.text))
        logger.info("Gemini suggested %d candidates", len(result.sources))
        return result.sources
    except Exception as exc:
        logger.error("Gemini discovery error: %s", exc)
        return []

def evaluate_source(candidate: SourceCandidate, sample_titles: list[str]) -> Optional[SourceEvaluation]:
    """Évalue la qualité d'une source à partir de ses titres récents."""
    client = _gemini_client()
    if not client:
        return None

    prompt = f"""
Évalue cette source RSS pour un pipeline de veille IA/ML :

NOM : {candidate.name}
DOMAINE : {candidate.domain}
RAISON PROPOSÉE : {candidate.rationale}

TITRES RÉCENTS ({len(sample_titles)} articles) :
{chr(10).join(f'- {t}' for t in sample_titles[:15])}

Évalue sur :
- quality_score (1-10) : profondeur technique, originalité, fiabilité
- ai_focus_score (1-10) : centré sur l'IA/ML vs contenu généraliste
- update_frequency : fréquence de publication
- verdict : "add" si quality_score >= 6 ET ai_focus_score >= 6, sinon "reject"
- reason : explication courte (1 phrase)
"""
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SourceEvaluation,
                temperature=0.1,
                max_output_tokens=1024,
            ),
        )
        result: SourceEvaluation = response.parsed
        if result is None:
            result = SourceEvaluation(**json.loads(response.text))
        return result
    except Exception as exc:
        logger.error("Evaluation error for %s: %s", candidate.name, exc)
        return None

# ── Test RSS ──────────────────────────────────────────────────────────────────

def test_rss(url: str) -> Optional[dict]:
    """Teste si un flux RSS est valide et retourne des méta-données."""
    try:
        feed = feedparser.parse(url)
        if feed.bozo and not feed.entries:
            return None
        if not feed.entries:
            return None

        # Vérifier que le flux a des entrées récentes (< 60 jours)
        recent = 0
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=60)
        titles = []
        for entry in feed.entries[:20]:
            title = entry.get("title", "").strip()
            if title:
                titles.append(title)
            published = entry.get("published_parsed") or entry.get("updated_parsed")
            if published:
                pub_dt = datetime(*published[:6], tzinfo=timezone.utc)
                if pub_dt > cutoff:
                    recent += 1

        if recent == 0:
            logger.debug("No recent entries for %s", url)
            return None

        return {
            "titles":       titles,
            "recent_count": recent,
            "total":        len(feed.entries),
        }
    except Exception as exc:
        logger.debug("RSS test failed for %s: %s", url, exc)
        return None

# ── Supabase ──────────────────────────────────────────────────────────────────

def get_db() -> Optional[Client]:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        logger.error("Supabase credentials not set")
        return None
    return create_client(url, key)

def get_existing_urls(db: Client) -> set[str]:
    try:
        result = db.table("ai_sources").select("rss_url").execute()
        return {row["rss_url"] for row in (result.data or [])}
    except Exception:
        return set()

def save_source(db: Client, candidate: SourceCandidate, evaluation: SourceEvaluation) -> bool:
    try:
        db.table("ai_sources").upsert(
            {
                "name":             candidate.name,
                "rss_url":          candidate.rss_url,
                "domain":           candidate.domain,
                "quality_score":    evaluation.quality_score,
                "ai_focus_score":   evaluation.ai_focus_score,
                "update_frequency": evaluation.update_frequency,
                "active":           True,
                "discovered_at":    datetime.now(tz=timezone.utc).isoformat(),
            },
            on_conflict="rss_url",
            ignore_duplicates=False,
        ).execute()
        return True
    except Exception as exc:
        logger.error("Save source failed [%s]: %s", candidate.name, exc)
        return False

# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    logger.info("=== Source Discovery Agent started ===")

    db = get_db()
    if not db:
        sys.exit(1)

    # Sources déjà connues
    existing_urls = get_existing_urls(db)
    logger.info("Existing sources in DB: %d", len(existing_urls))

    # Gemini suggère de nouveaux candidats
    candidates = discover_candidates(existing_urls)
    if not candidates:
        logger.error("No candidates returned — aborting")
        sys.exit(1)

    added = 0
    rejected = 0
    failed = 0

    for candidate in candidates:
        # Éviter les doublons
        if candidate.rss_url in existing_urls:
            logger.info("SKIP (known): %s", candidate.name)
            continue

        logger.info("TESTING: %s — %s", candidate.name, candidate.rss_url)

        # Test RSS
        rss_data = test_rss(candidate.rss_url)
        if not rss_data:
            logger.info("FAIL (bad RSS): %s", candidate.name)
            failed += 1
            continue

        logger.info("  RSS OK — %d recent / %d total entries", rss_data["recent_count"], rss_data["total"])

        # Évaluation Gemini
        evaluation = evaluate_source(candidate, rss_data["titles"])
        if not evaluation:
            failed += 1
            continue

        logger.info("  Score: quality=%d/10 ai_focus=%d/10 -> %s (%s)",
                    evaluation.quality_score, evaluation.ai_focus_score,
                    evaluation.verdict.upper(), evaluation.reason)

        if evaluation.verdict == "add":
            if save_source(db, candidate, evaluation):
                added += 1
                existing_urls.add(candidate.rss_url)
                logger.info("  ✓ ADDED: %s", candidate.name)
        else:
            rejected += 1

    logger.info("=== Discovery complete: +%d added | %d rejected | %d failed ===",
                added, rejected, failed)

if __name__ == "__main__":
    main()
