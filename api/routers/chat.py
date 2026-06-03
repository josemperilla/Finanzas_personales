"""Endpoint de chat con el asistente financiero (contexto server-side)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from api.db import get_db
from api.deps import get_current_user
from api.models import ChatMessage, User
from api.schemas import ChatIn, ChatOut
from api.services import llm
from api.services.context import build_context

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatOut)
def chat(
    body: ChatIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    context = build_context(db, user.id)
    try:
        answer = llm.chat(body.question, context)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    db.add(ChatMessage(user_id=user.id, role="user", content=body.question))
    db.add(ChatMessage(user_id=user.id, role="assistant", content=answer))
    db.commit()
    return ChatOut(answer=answer)
