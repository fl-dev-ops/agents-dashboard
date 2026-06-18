from __future__ import annotations

import logging
from collections.abc import Sequence
from enum import Enum
from typing import Any

from mem0 import AsyncMemoryClient

logger = logging.getLogger(__name__)


class MemoryCategory(str, Enum):
    PERSONAL_INFO = "personal_info"
    LOCATION = "location"
    EDUCATION = "education"
    WORK_EXPERIENCE = "work_experience"
    JOB_INTEREST = "job_interest"
    SKILLS = "skills"
    SCREENING_RESULT = "screening_result"
    PREFERENCE = "preference"
    EVENT = "event"
    PERSONALITY = "personality"


VALID_CATEGORIES: set[str] = {c.value for c in MemoryCategory}

CATEGORY_DESCRIPTIONS: dict[str, str] = {
    MemoryCategory.PERSONAL_INFO: "Name, age, gender, basic identity details",
    MemoryCategory.LOCATION: "City, state, region, where the candidate is from or based",
    MemoryCategory.EDUCATION: "Degrees, institutions, field of study, year of completion",
    MemoryCategory.WORK_EXPERIENCE: "Past jobs, internships, work duration, responsibilities",
    MemoryCategory.JOB_INTEREST: "Target roles, career goals, industry or domain preference",
    MemoryCategory.SKILLS: "Technical skills, soft skills, certifications, languages spoken",
    MemoryCategory.SCREENING_RESULT: "CEFR level, screening outcome, assessment observations",
    MemoryCategory.PREFERENCE: "Work style preferences, likes, dislikes, habits",
    MemoryCategory.EVENT: "Upcoming plans, scheduled follow-ups, past session references",
    MemoryCategory.PERSONALITY: "Behavioral observations, confidence level, demeanor, attitude",
}

_CATEGORY_BLOCK = "\n".join(
    f"  - {name}: {desc}" for name, desc in CATEGORY_DESCRIPTIONS.items()
)


async def ensure_user_entity(
    memory_client: AsyncMemoryClient,
    user_id: str,
) -> bool:
    try:
        users_api = await memory_client.users
        if callable(users_api):
            users_api = users_api()
    except Exception as e:
        logger.debug(f"Failed to get users API: {e}")
        return False

    try:
        existing = await users_api.get(user_id)
        if existing:
            logger.debug(f"User entity already exists: {user_id}")
            return False
    except Exception:
        pass

    try:
        await users_api.add(user_id=user_id)
        logger.info(f"Created user entity in mem0: {user_id}")
        return True
    except Exception as e:
        logger.debug(f"User entity creation returned: {e}")
        return False


async def search_memories(
    memory_client: AsyncMemoryClient,
    query: str,
    user_id: str,
    categories: Sequence[str] | None = None,
) -> dict[str, Any]:
    filters: dict[str, Any] = {"user_id": user_id}
    if categories:
        filters["metadata"] = {"category": {"in": categories}}
    return await memory_client.search(query, filters=filters)


__all__ = [
    "AsyncMemoryClient",
    "MemoryCategory",
    "ensure_user_entity",
    "search_memories",
]
