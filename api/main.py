"""
Backend FastAPI — actualmente NO desplegado.
La PWA usa Google Apps Script como backend activo (apps_script/webhook.gs).
Este backend se activará cuando se superen ~10 usuarios (ver TODOS.md).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.db import Base, SessionLocal, engine
from api.routers import auth, budgets, categories, chat, transactions, voice
from api.seed import seed_catalog
from api.settings import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Finanzas Personales API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Bootstrap del esquema y catálogo (en prod las migraciones las maneja Alembic).
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_catalog(db)

    app.include_router(auth.router)
    app.include_router(categories.router)
    app.include_router(transactions.router)
    app.include_router(budgets.router)
    app.include_router(voice.router)
    app.include_router(chat.router)

    @app.get("/health", tags=["health"])
    def health():
        return {"ok": True}

    return app


app = create_app()
