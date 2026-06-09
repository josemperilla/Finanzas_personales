"""
Migración masiva de categorías v1 → v2.

Renombra categorías obsoletas y re-detecta Domicilios / Bre-B / Restaurantes
en todos los sheets de usuario via el webhook de GAS.

Requisitos:
  - webhook.gs ya desplegado con la función migrateCategories()
  - .env con WEBHOOK_URL

Uso:
  python tools/migrate_categories.py
"""

import os
import sys
import json
import urllib.request
import urllib.error

# ── Cargar .env ────────────────────────────────────────────────────────────
def load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
    env = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env

env = load_env()
WEBHOOK_URL = env.get("WEBHOOK_URL", "").split("?")[0]  # base URL without _secret
SECRET = ""
if "?_secret=" in env.get("WEBHOOK_URL", ""):
    SECRET = env["WEBHOOK_URL"].split("?_secret=")[1]
elif "?" in env.get("WEBHOOK_URL", ""):
    SECRET = env["WEBHOOK_URL"].split("_secret=")[1]

if not WEBHOOK_URL or not SECRET:
    print("ERROR: WEBHOOK_URL no encontrado en .env")
    sys.exit(1)

# ── POST al webhook ────────────────────────────────────────────────────────
def webhook_post(payload: dict) -> dict:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}

# ── Main ───────────────────────────────────────────────────────────────────
def main():
    print("Conectando al webhook de Google Apps Script...")
    print(f"URL: {WEBHOOK_URL}\n")

    result = webhook_post({
        "_secret": SECRET,
        "type": "migrateCategories",
        "userId": "jose",  # admin user required
    })

    if result.get("ok"):
        stats = result.get("stats", {})
        total = sum(stats.values())
        print(f"✓ Migración completada. {total} filas actualizadas en total.")
        for user, count in stats.items():
            print(f"  {user}: {count} filas")
    else:
        print(f"✗ Error: {result.get('error', 'respuesta inesperada')}")
        print(f"  Respuesta completa: {result}")
        sys.exit(1)

if __name__ == "__main__":
    main()
