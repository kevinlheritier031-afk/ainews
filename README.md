# ai/news

Veille technologique IA 100% automatisée. Chaque matin à 07:00 UTC, un pipeline
Python collecte les sources RSS + Hacker News, les filtre via Gemini 2.5 Flash,
et pousse le résultat dans Supabase. L'app Android affiche le signal brut.

```
┌─────────────────────────────────────────────────────┐
│  Sources RSS          Hacker News API               │
│  (HF · OpenAI ·       (filtre: points > 50,         │
│   Anthropic · DM)      9 keywords IA)               │
└──────────────┬──────────────────┬───────────────────┘
               │                  │
               └────────┬─────────┘
                        ▼
              ┌─────────────────┐
              │  Gemini 2.5     │
              │  Flash          │  Structured Output
              │  (temperature   │  → NewsCollection
              │   0.2)          │    (5–12 items)
              └────────┬────────┘
                       │ UPSERT (idempotent)
                       ▼
              ┌─────────────────┐
              │   Supabase      │
              │   PostgreSQL    │
              │   (ai_news)     │
              └────────┬────────┘
                       │ SDK JS (anon key)
                       ▼
              ┌─────────────────┐
              │  React Native   │
              │  Expo           │
              │  Android APK    │
              └─────────────────┘
```

---

## 1. Setup Supabase

1. Crée un projet sur [supabase.com](https://supabase.com)
2. Dans **SQL Editor**, exécute :

```sql
-- colle le contenu de pipeline/supabase_schema.sql
```

3. Récupère :
   - `Project URL` → `SUPABASE_URL`
   - `anon public` key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_KEY`

---

## 2. Setup Pipeline

```bash
cd pipeline
pip install -r requirements.txt
cp .env.example .env
# édite .env avec tes clés
python collect_news.py
```

---

## 3. Setup Mobile

```bash
cd mobile
npm install
cp .env.example .env
# édite .env avec EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY
npx expo start
```

---

## 4. Build APK Android

```bash
cd mobile
npx expo run:android --variant release
```

L'APK se trouve dans `android/app/build/outputs/apk/release/`.

---

## 5. GitHub Actions (automatisme quotidien)

Dans **Settings → Secrets → Actions** de ton repo, ajoute :

| Secret               | Valeur                        |
|----------------------|-------------------------------|
| `GEMINI_API_KEY`     | ta clé Google AI Studio       |
| `SUPABASE_URL`       | URL de ton projet Supabase    |
| `SUPABASE_SERVICE_KEY` | clé `service_role` Supabase |

Le workflow `.github/workflows/daily-pipeline.yml` se déclenche chaque jour
à 07:00 UTC et peut aussi être lancé manuellement via **workflow_dispatch**.
