"""Tests de la API FastAPI (Fase 0): auth, transacciones, presupuestos, aislamiento."""
import os
import tempfile

import pytest

# Configurar entorno ANTES de importar la app (settings se cachea al importar).
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp.name}"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ANTHROPIC_API_KEY"] = ""  # fuerza 503 en voz/chat, sin llamadas reales

from fastapi.testclient import TestClient  # noqa: E402

from api.main import create_app  # noqa: E402

app = create_app()


@pytest.fixture
def client():
    return TestClient(app)


def _register(client, email="a@test.com", password="password123"):
    r = client.post("/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_health(client):
    assert client.get("/health").json() == {"ok": True}


def test_register_login_me(client):
    tokens = _register(client, "user1@test.com")
    assert "access_token" in tokens and "refresh_token" in tokens

    r = client.post("/auth/login", json={"email": "user1@test.com", "password": "password123"})
    assert r.status_code == 200
    access = r.json()["access_token"]

    me = client.get("/auth/me", headers=_auth(access))
    assert me.status_code == 200
    assert me.json()["email"] == "user1@test.com"


def test_register_duplicate_email(client):
    _register(client, "dup@test.com")
    r = client.post("/auth/register", json={"email": "dup@test.com", "password": "password123"})
    assert r.status_code == 409


def test_requires_auth(client):
    assert client.get("/transactions").status_code == 401
    assert client.get("/categories").status_code == 401


def test_categories_seeded(client):
    tokens = _register(client, "cat@test.com")
    r = client.get("/categories", headers=_auth(tokens["access_token"]))
    assert r.status_code == 200
    names = {c["name"] for c in r.json()}
    assert "restaurantes" in names and "transporte" in names


def test_create_and_list_transaction_with_rule_categorization(client):
    tokens = _register(client, "tx@test.com")
    h = _auth(tokens["access_token"])
    # "NETFLIX" debe caer en suscripciones por regla de sistema.
    r = client.post("/transactions", headers=h, json={
        "monto": 37900, "comercio": "NETFLIX.COM", "banco": "Itaú", "tipo": "Compra",
    })
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["category_name"] == "Suscripciones"
    assert body["amount_cop"] == 37900

    lst = client.get("/transactions", headers=h)
    assert lst.status_code == 200
    page = lst.json()
    assert page["total"] == 1
    assert page["items"][0]["clean_merchant"] == "NETFLIX.COM"


def test_pagination(client):
    tokens = _register(client, "page@test.com")
    h = _auth(tokens["access_token"])
    for i in range(5):
        client.post("/transactions", headers=h, json={
            "monto": 1000 + i, "comercio": f"Tienda {i}", "banco": "Otro",
        })
    r = client.get("/transactions?limit=2&offset=0", headers=h)
    page = r.json()
    assert page["total"] == 5
    assert len(page["items"]) == 2
    assert page["limit"] == 2


def test_update_category(client):
    tokens = _register(client, "upd@test.com")
    h = _auth(tokens["access_token"])
    tx = client.post("/transactions", headers=h, json={
        "monto": 5000, "comercio": "Comercio raro", "banco": "Otro",
    }).json()
    r = client.patch(f"/transactions/{tx['id']}/category", headers=h, json={"categoria": "Salud"})
    assert r.status_code == 200
    assert r.json()["category_name"] == "Salud"


def test_user_isolation(client):
    t1 = _register(client, "iso1@test.com")
    t2 = _register(client, "iso2@test.com")
    h1, h2 = _auth(t1["access_token"]), _auth(t2["access_token"])

    tx = client.post("/transactions", headers=h1, json={
        "monto": 9999, "comercio": "Privado", "banco": "Otro",
    }).json()

    # user2 no ve la transacción de user1
    assert client.get("/transactions", headers=h2).json()["total"] == 0
    # user2 no puede editar la transacción de user1
    assert client.patch(
        f"/transactions/{tx['id']}/category", headers=h2, json={"categoria": "Salud"}
    ).status_code == 404


def test_budgets_upsert_and_list(client):
    tokens = _register(client, "bud@test.com")
    h = _auth(tokens["access_token"])
    cats = client.get("/categories", headers=h).json()
    cat_id = cats[0]["id"]

    r = client.put("/budgets", headers=h, json={
        "category_id": cat_id, "month": "2026-06", "amount_cop": 200000,
    })
    assert r.status_code == 200
    # Upsert: actualiza el mismo registro
    r2 = client.put("/budgets", headers=h, json={
        "category_id": cat_id, "month": "2026-06", "amount_cop": 250000,
    })
    assert r2.json()["amount_cop"] == 250000

    lst = client.get("/budgets?month=2026-06", headers=h).json()
    assert len(lst) == 1 and lst[0]["amount_cop"] == 250000


def test_voice_without_key_returns_503(client):
    tokens = _register(client, "voice@test.com")
    h = _auth(tokens["access_token"])
    r = client.post("/voice/parse", headers=h, json={"text": "gasté 20 mil en uber"})
    assert r.status_code == 503


def test_chat_without_key_returns_503(client):
    tokens = _register(client, "chat@test.com")
    h = _auth(tokens["access_token"])
    r = client.post("/chat", headers=h, json={"question": "¿cuánto gasté?"})
    assert r.status_code == 503
