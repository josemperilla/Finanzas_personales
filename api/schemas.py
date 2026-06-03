"""Esquemas Pydantic para validación de entrada/salida de la API."""
from __future__ import annotations

from datetime import date as date_type
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ── Auth ──────────────────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshIn(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str | None = None

    model_config = {"from_attributes": True}


# ── Categorías ────────────────────────────────────────────────────────────────
class CategoryOut(BaseModel):
    id: int
    name: str
    name_es: str
    icon: str
    color: str
    is_income: bool

    model_config = {"from_attributes": True}


# ── Transacciones ─────────────────────────────────────────────────────────────
class TransactionOut(BaseModel):
    id: str
    date: date_type
    original_description: str
    clean_merchant: str | None
    amount_original: float
    currency_original: str
    amount_cop: float | None
    transaction_type: str
    category_id: int | None
    category_name: str | None = None
    category_color: str | None = None
    category_icon: str | None = None
    source_bank: str
    account_number: str | None
    is_recurring: bool
    notes: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionPage(BaseModel):
    items: list[TransactionOut]
    total: int
    limit: int
    offset: int


class ManualTransactionIn(BaseModel):
    monto: float = Field(gt=0, le=1_000_000_000)
    comercio: str = Field(min_length=1, max_length=200)
    banco: str = Field(min_length=1, max_length=40)
    tipo: str = Field(default="Compra", max_length=40)
    categoria: str | None = Field(default=None, max_length=60)
    tarjeta: str | None = Field(default=None, max_length=60)
    fecha: date_type | None = None
    moneda: str = Field(default="COP", max_length=3)


class UpdateCategoryIn(BaseModel):
    categoria: str = Field(min_length=1, max_length=60)


# ── Voz ───────────────────────────────────────────────────────────────────────
class VoiceIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


class VoiceParsedOut(BaseModel):
    monto: float
    comercio: str
    categoria: str
    banco: str
    tipo: str


# ── Presupuestos ──────────────────────────────────────────────────────────────
class BudgetIn(BaseModel):
    category_id: int
    month: str = Field(pattern=r"^\d{4}-\d{2}$")
    amount_cop: float = Field(ge=0, le=1_000_000_000)


class BudgetOut(BaseModel):
    id: int
    category_id: int
    month: str
    amount_cop: float

    model_config = {"from_attributes": True}


# ── Chat ──────────────────────────────────────────────────────────────────────
class ChatIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


class ChatOut(BaseModel):
    answer: str
