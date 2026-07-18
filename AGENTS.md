# Repository Guidelines

## Project Structure & Module Organization

`main.py` is the interactive CLI entry point. Keep domain logic outside it: retrieval and ingestion belong in `rag/`, learner-memory workflows in `memory/`, study sessions and quizzes in `study/`, and provider construction in `llm/`. Automated checks live in `tests/`; name new files `test_*.py`. Runtime SQLite and Chroma artifacts are stored under `data/` and should not be treated as source. Add reusable fixtures or sample documents outside generated data directories.

## Setup, Test, and Development Commands

Use Python from the repository root (PowerShell examples):

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python main.py
```

The final command initializes local databases and launches the menu-driven application. Run all tests with:

```powershell
python -m unittest discover -s tests -p "test_*.py"
```

There is no separate build step or configured formatter/linter. Before submitting, run the test suite and exercise any changed CLI path manually.

## Coding Style & Naming Conventions

Follow standard Python conventions: four-space indentation, `snake_case` for modules/functions/variables, `PascalCase` for classes and dataclasses, and uppercase names for configuration constants. Preserve `from __future__ import annotations` in modules that use it, add type hints to public boundaries, and keep functions focused on one responsibility. Use short docstrings where behavior or failure handling is not obvious. Put validation and persistence in domain modules rather than embedding them in CLI handlers.

## Testing Guidelines

Tests use the standard-library `unittest` framework. Isolate database state with temporary directories and patch connection factories, following `tests/test_backend_e2e.py`; never depend on committed contents of `data/`. Cover success paths, invalid inputs, transaction rollback, and persistence/reporting behavior. No numeric coverage threshold is configured, but changes should include regression tests for affected workflows.

## Commit & Pull Request Guidelines

Recent commits use concise, lowercase, action-oriented subjects such as `add grounded quiz generation and interactive quiz runner`. Keep each commit scoped to one coherent change. Pull requests should explain the user-visible outcome, architectural impact, test commands/results, configuration or migration effects, and linked issues. Include terminal output or screenshots when CLI behavior changes.

## Security & Configuration

Store provider settings in the ignored `.env` file (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, and, when needed, `LLM_BASE_URL`). Never commit secrets, `.venv/`, caches, or generated databases/vector indexes. Validate external file inputs and preserve transaction boundaries when changing ingestion or deletion flows.
