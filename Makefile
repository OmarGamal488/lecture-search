.DEFAULT_GOAL := help
SHELL := /usr/bin/env bash

VENV ?= .venv
PYTHON ?= $(VENV)/bin/python

.PHONY: help install install-uv api dev start stop test fmt lint clean docker-build docker-up docker-down eval-qa

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install package + dev deps in current Python (preferring pip)
	pip install -e .[dev]

install-uv: ## Install with uv (fast); requires .venv created via `uv venv`
	uv pip install --python $(PYTHON) -e .[dev]

api: ## Run the FastAPI backend on :8000 (foreground — also serves the UI at /app/)
	$(PYTHON) -m lecture_search.api.app

dev: ## Run API with autoreload (foreground)
	$(PYTHON) -m uvicorn lecture_search.api.app:app --reload --host 0.0.0.0 --port 8000

start: ## Start API in the background (logs in ./logs). Open http://localhost:8000/
	bash scripts/start.sh

stop: ## Stop the background API
	bash scripts/stop.sh

test: ## Run pytest
	$(PYTHON) -m pytest

fmt: ## Format with black + ruff
	$(PYTHON) -m black src tests
	$(PYTHON) -m ruff check --fix src tests

lint: ## Lint with ruff
	$(PYTHON) -m ruff check src tests

clean: ## Remove build/cache artifacts (data/ and logs/ are kept)
	rm -rf build dist src/*.egg-info
	find . -type d -name __pycache__ -prune -exec rm -rf {} +
	find . -type d -name .pytest_cache -prune -exec rm -rf {} +
	find . -type d -name .ruff_cache -prune -exec rm -rf {} +

docker-build: ## Build the API image (UI is served from the same container)
	docker compose build

docker-up: ## Start the API container (requires .env)
	docker compose up -d

docker-down: ## Stop all services
	docker compose down

eval-qa: ## Evaluate current QA program (compiled or zero-shot) on the eval set
	$(PYTHON) scripts/evaluate_qa.py --num-threads 1

# Personal/local-only targets (deploy-hf, gen-eval, compile-prompts) live
# in Makefile.local, which is gitignored. The dash before -include keeps
# the build silent if the file isn't there (e.g. on a fresh clone).
-include Makefile.local
