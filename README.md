# Lecture Search Engine

> A self-hosted lecture-video search platform — FastAPI + LangGraph ingest, Whisper transcription, Chroma vector retrieval, DSPy-optimized RAG, and a single-process React UI. Bilingual (Arabic + English) by design, provider-neutral for any OpenAI-compatible LLM.

[![Hugging Face Space](https://img.shields.io/badge/HF%20Space-live-yellow.svg)](https://huggingface.co/spaces/OmarGamal48812/lecture-search)
[![Python 3.11+](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688.svg)](https://fastapi.tiangolo.com/)
[![LangGraph](https://img.shields.io/badge/LangGraph-StateGraph-1c3c3c.svg)](https://langchain-ai.github.io/langgraph/)
[![DSPy](https://img.shields.io/badge/DSPy-ChainOfThought-7c3aed.svg)](https://dspy.ai/)
[![Whisper](https://img.shields.io/badge/Whisper-medium-412991.svg)](https://github.com/openai/whisper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Live demo

**App URL:** [OmarGamal48812-lecture-search.hf.space](https://OmarGamal48812-lecture-search.hf.space/)
**Build status:** [huggingface.co/spaces/OmarGamal48812/lecture-search](https://huggingface.co/spaces/OmarGamal48812/lecture-search)

Runs on Hugging Face's free CPU tier. First-load is slow while Whisper
and the embedding model warm up; uploads are wiped on Space restart
unless you attach persistent storage.

---

## What it is

Drag-and-drop an MP4. A seven-stage LangGraph pipeline pulls the audio
(FFmpeg), transcribes it with Whisper, slices the transcript into
overlapping 45-second chunks, embeds each chunk with sentence-transformers,
and writes both to SQLite + Chroma. You then get:

- **Search** — semantic similarity, MMR, or score-threshold; results are
  ranked, color-graded chunks with the original timestamp.
- **Ask** — token-streamed RAG answer with `[N]` citation chips that
  anchor to source cards revealed after the stream completes.
- **Summarize** — short / medium / long per-lecture summaries.

The whole thing is one FastAPI process. The React UI is plain HTML +
Babel-in-browser served from `/app/`; there's no separate frontend build
and no Node runtime at deploy time. The LLM is provider-neutral — any
OpenAI-compatible endpoint works.

---

## Highlights

- **LangGraph pipeline you can watch run.** Each of the seven nodes
  fires an `on_step` callback that drives a live React visualizer with
  per-stage Lucide icons, tri-color pulse on the active stage, and an
  elapsed-seconds counter so transcription's long pause looks honest.
- **DSPy-compilable RAG.** `RAGEngine.ask` uses a `ChainOfThought`
  program that auto-loads its compiled few-shot state when
  `data/compiled/qa_program.json` exists, runs zero-shot otherwise.
  `make compile-prompts` regenerates the compiled state from an
  LLM-bootstrapped eval set scored by an embedding-similarity metric.
- **Streaming Q&A without a streaming framework.** `/ask/stream` is a
  vanilla chunked `text/plain` response; the browser tokenizes on the
  fly, fades each word in, and inlines `[N]` citation chips that link
  to source cards revealed when the stream completes.
- **Single-process React UI.** `ui/web/` is plain HTML + UMD React +
  Babel-in-browser + Lucide. FastAPI mounts it at `/app/` via
  `StaticFiles`. No bundler, no Node at deploy time, no microservice
  for the frontend.
- **Bilingual everywhere.** Every chunk surface uses `unicode-bidi:
  plaintext; text-align: start;` so Arabic+English mixed runs render
  correctly without any explicit `dir=` attribute.

---

## Architecture

```
                            ┌──────────────────────────────┐
              ┌────────────►│  /app/   React UI            │
              │   browser   │  served by StaticFiles       │
              │             └──────────────▲───────────────┘
              │                            │ JSON / chunked stream
   ┌──────────┴──────────────────────────────────────┐
   │           FastAPI (Uvicorn, single process)      │
   │  routes: /upload  /videos  /search  /ask         │
   │          /ask/stream  /summarize  /stats         │
   │                                                  │
   │  app.state.video_processor  ◄── VideoProcessorGraph (LangGraph)
   │  app.state.search_engine    ◄── SearchEngine
   │  app.state.rag_engine       ◄── RAGEngine (DSPy + LCEL)
   └─────┬───────────────────┬───────────────┬───────┘
         │ ORM               │ HTTPS         │ embed / transcribe
   ┌─────▼────────┐   ┌──────▼────────┐  ┌───▼─────────────────────┐
   │ SQLite       │   │ OpenAI-       │  │ Whisper (local)         │
   │ lectures.db  │   │ compatible    │  │ sentence-transformers   │
   │ + chunks     │   │ LLM endpoint  │  │ ChromaDB (persistent)   │
   └──────────────┘   └───────────────┘  └─────────────────────────┘
```

---

## Quickstart

### Local

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .[dev]
sudo apt-get install ffmpeg

cp .env.example .env       # set LECTURE_SEARCH_LLM_BASE_URL / API_KEY / MODEL

make start                 # background; logs in ./logs/
# or `make api` (foreground) or `make dev` (--reload)
```

Open **http://localhost:8000/** — root 307-redirects to the React UI at
`/app/`.

`make stop` halts the background service.

### Docker

```bash
cp .env.example .env  &&  $EDITOR .env
docker compose build && docker compose up -d
# → http://localhost:8000
```

A single container ships both the API and the UI.

### Hugging Face Spaces

The repo carries the right metadata (the YAML front-matter at the top
of this file) to deploy directly as a Hugging Face **Docker Space**.
Push the repo to a new Space, set `LECTURE_SEARCH_LLM_BASE_URL`,
`LECTURE_SEARCH_LLM_API_KEY`, and `LECTURE_SEARCH_LLM_MODEL` in the
Space's **Secrets**, and HF will build the Dockerfile for you.

> **Free-tier note.** CPU-only (2 vCPU / 16 GB RAM); a 30-min video
> takes ~15–25 min to transcribe on Whisper-medium. The Space
> filesystem is ephemeral on the free tier — add HF Persistent Storage
> and point `LECTURE_SEARCH_DATA_DIR` at the mount to keep uploads
> across restarts.

See `.env.example` for the full list of configurable env vars.

---

## Prompt optimization with DSPy

`RAGEngine.ask` runs a DSPy `ChainOfThought` program. If
`data/compiled/qa_program.json` exists at startup, the engine loads it
and `/ask` uses the optimized few-shot prompt; otherwise it falls back
to zero-shot.

The compilation metric is cosine similarity between gold and predicted
answers using the same `all-mpnet-base-v2` encoder that powers
retrieval — no additional models are loaded.

Set `LECTURE_SEARCH_FORCE_ZERO_SHOT=1` to bypass the compiled state.

---

## Project layout

```
lecture-search/
├── pyproject.toml · requirements.txt
├── Dockerfile · docker-compose.yml · Makefile · README.md · .env.example
│
├── scripts/
│   ├── start.sh · stop.sh
│   └── evaluate_qa.py
│
├── src/lecture_search/
│   ├── config.py
│   ├── api/      app.py · dependencies.py · schemas.py · routes/*.py
│   ├── ingestion/ audio.py · transcriber.py · chunker.py · pipeline.py
│   ├── retrieval/ vector_store.py · search.py
│   ├── rag/       engine.py · signatures.py · dspy_program.py · metric.py
│   └── storage/   models.py · database.py
│
├── ui/web/        index.html · colors_and_type.css · assets/ · components/
│
├── tests/         pytest tests
├── data/          videos / chroma / sqlite / compiled  (gitignored)
└── logs/          runtime logs                          (gitignored)
```

---

## Development

```bash
make fmt        # black + ruff --fix
make lint       # ruff
make test       # pytest
make clean      # build/cache artifacts (data/ and logs/ are preserved)
```

---

## Author

**Omar Gamal ElKady** — Information Technology Institute (ITI), AI Track, Intake 46.

- Email: [omargamal48812@gmail.com](mailto:omargamal48812@gmail.com)
- Hugging Face: [@OmarGamal48812](https://huggingface.co/OmarGamal48812)
- Live deployment: [huggingface.co/spaces/OmarGamal48812/lecture-search](https://huggingface.co/spaces/OmarGamal48812/lecture-search)

---

## License

MIT.
