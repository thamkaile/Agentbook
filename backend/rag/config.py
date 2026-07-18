from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

# ============================================================
# PROJECT PATHS
# ============================================================

PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Load the repository-level environment file regardless of launch directory.
load_dotenv(PROJECT_ROOT / ".env")
DATA_DIR = Path(
    os.getenv("STUDY_DATA_DIR", str(PROJECT_ROOT / "data"))
).expanduser().resolve()

DATABASE_PATH = DATA_DIR / "app.db"

CHROMA_PATH = DATA_DIR / "chroma"
MEMORY_CHROMA_PATH = DATA_DIR / "memory_chroma"


# ============================================================
# CHROMA COLLECTIONS
# ============================================================

CHROMA_COLLECTION = "study_documents"
MEMORY_CHROMA_COLLECTION = "learner_memories"


# ============================================================
# LLM PROVIDER
# ============================================================

LLM_PROVIDER = os.getenv(
    "LLM_PROVIDER",
    "openrouter",
).strip().lower()

LLM_API_KEY = os.getenv(
    "LLM_API_KEY",
    "",
).strip()

LLM_MODEL = os.getenv(
    "LLM_MODEL",
    "",
).strip()

LLM_BASE_URL = os.getenv(
    "LLM_BASE_URL",
    "",
).strip()


SUPPORTED_LLM_PROVIDERS = {
    "openrouter",
    "openai_compatible",
    "groq",
}


def validate_llm_config() -> None:
    """
    Validate the configured LLM provider before creating a model.
    """
    if LLM_PROVIDER not in SUPPORTED_LLM_PROVIDERS:
        supported = ", ".join(
            sorted(SUPPORTED_LLM_PROVIDERS)
        )

        raise RuntimeError(
            f"Unsupported LLM_PROVIDER: {LLM_PROVIDER}. "
            f"Supported providers: {supported}"
        )

    if not LLM_API_KEY:
        raise RuntimeError(
            "LLM_API_KEY is missing from .env."
        )

    if not LLM_MODEL:
        raise RuntimeError(
            "LLM_MODEL is missing from .env."
        )

    if (
        LLM_PROVIDER == "openai_compatible"
        and not LLM_BASE_URL
    ):
        raise RuntimeError(
            "LLM_BASE_URL is required when "
            "LLM_PROVIDER=openai_compatible."
        )
# ============================================================
# EMBEDDING MODEL
# ============================================================

EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
).strip()


# ============================================================
# DOCUMENT RAG SETTINGS
# ============================================================

CHUNK_SIZE = int(
    os.getenv("CHUNK_SIZE", "1000")
)

CHUNK_OVERLAP = int(
    os.getenv("CHUNK_OVERLAP", "200")
)

RETRIEVAL_K = int(
    os.getenv("RETRIEVAL_K", "5")
)


# ============================================================
# MEMORY RETRIEVAL SETTINGS
# ============================================================

MEMORY_RETRIEVAL_K = int(
    os.getenv("MEMORY_RETRIEVAL_K", "5")
)

MAX_MEMORY_DISTANCE = float(
    os.getenv("MAX_MEMORY_DISTANCE", "1.15")
)


# ============================================================
# MEMORY PROPOSAL SETTINGS
# ============================================================

ENABLE_MEMORY_PROPOSALS = (
    os.getenv(
        "ENABLE_MEMORY_PROPOSALS",
        "true",
    )
    .strip()
    .lower()
    in {
        "1",
        "true",
        "yes",
        "on",
    }
)

MEMORY_PROPOSAL_MIN_CONFIDENCE = float(
    os.getenv(
        "MEMORY_PROPOSAL_MIN_CONFIDENCE",
        "0.75",
    )
)

MEMORY_PROPOSAL_MIN_IMPORTANCE = float(
    os.getenv(
        "MEMORY_PROPOSAL_MIN_IMPORTANCE",
        "0.40",
    )
)


# ============================================================
# MEMORY DUPLICATE DETECTION
# ============================================================

MEMORY_DUPLICATE_MAX_DISTANCE = float(
    os.getenv(
        "MEMORY_DUPLICATE_MAX_DISTANCE",
        "0.40",
    )
)


# ============================================================
# DIRECTORY INITIALIZATION
# ============================================================

def ensure_directories() -> None:
    """
    Create all required local data directories.
    """
    DATA_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    CHROMA_PATH.mkdir(
        parents=True,
        exist_ok=True,
    )

    MEMORY_CHROMA_PATH.mkdir(
        parents=True,
        exist_ok=True,
    )

LLM_REASONING_VISIBLE = (
    os.getenv(
        "LLM_REASONING_VISIBLE",
        "false",
    )
    .strip()
    .lower()
    in {
        "1",
        "true",
        "yes",
        "on",
    }
)

MAX_UPLOAD_BYTES = int(
    os.getenv("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024))
)
