
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from main import (
    get_db,
    Hackathon,
    HackathonInput,
    payload_to_db_values,
    ALLOWED_STATUSES,
)

router = APIRouter(prefix="/api/ai", tags=["AI Publish"])


@router.post("/publish")
def publish_ai_hackathon(
    payload: HackathonInput,
    db: Session = Depends(get_db),
):
    if db.get(Hackathon, payload.event_id) is not None:
        raise HTTPException(
            status_code=409,
            detail="This event ID already exists",
        )

    values = payload_to_db_values(payload)

    if values["status"] not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=422,
            detail="Invalid event status",
        )

    event = Hackathon(**values)
    db.add(event)

    try:
        db.commit()
        db.refresh(event)
    except Exception:
        db.rollback()
        raise

    return event
