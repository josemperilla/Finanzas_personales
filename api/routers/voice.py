"""Endpoint de parseo de voz a transacción estructurada vía Claude."""
from fastapi import APIRouter, Depends, HTTPException, status

from api.deps import get_current_user
from api.schemas import VoiceIn, VoiceParsedOut
from api.services import llm

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/parse", response_model=VoiceParsedOut)
def parse(body: VoiceIn, _=Depends(get_current_user)):
    try:
        data = llm.parse_voice(body.text)
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No pude interpretar el audio. Intenta de nuevo con más detalle.",
        )
    return VoiceParsedOut(
        monto=float(data.get("monto") or 0),
        comercio=str(data.get("comercio") or ""),
        categoria=str(data.get("categoria") or "Otros"),
        banco=str(data.get("banco") or "Otro"),
        tipo=str(data.get("tipo") or "Compra"),
    )
