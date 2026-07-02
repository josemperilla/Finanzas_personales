# Modelo de ramas — Personal Finance Manager

## Regla fundamental

**`main` = producción.** Un push a `main` despliega automáticamente a Cloudflare Pages
(`finanzas-abiertas`). Nada más llega a los usuarios reales.

Todo lo demás es desarrollo. No hay rama de staging, no hay rama de QA permanente.

---

## Las dos únicas categorías

### `main` — Producción
- **Nunca** commitear directamente aquí.
- Solo recibe cambios mediante Pull Request desde una rama de trabajo.
- Siempre está en el mismo estado que lo que ven los usuarios.

### `feat/*`, `fix/*`, `docs/*`, `style/*` — Ramas de trabajo
- Aquí se desarrolla todo.
- Se crean desde `origin/main` (no desde el `main` local).
- Cuando el trabajo está listo → PR → `main` → deploy automático.
- Una vez mergeada la PR, la rama se elimina.

---

## Cómo crear una rama de trabajo

```bash
git fetch origin
git checkout -b feat/nombre-descriptivo origin/main
```

Siempre desde `origin/main`, nunca desde el `main` local (puede estar desactualizado).

---

## Ciclo completo de una feature

```
origin/main → feat/mi-feature → (desarrollo) → PR → merge → deploy automático
```

1. `git fetch origin`
2. `git checkout -b feat/mi-feature origin/main`
3. Desarrollar, commitear
4. `git push origin feat/mi-feature`
5. Abrir PR en GitHub: `feat/mi-feature` → `main`
6. Revisar, aprobar, mergear
7. Cloudflare despliega automáticamente
8. Eliminar la rama

---

## Convenciones de nombre

| Prefijo | Cuándo usarlo |
|---|---|
| `feat/` | Nueva funcionalidad |
| `fix/` | Corrección de bug |
| `style/` | Cambios visuales / design tokens |
| `docs/` | Solo documentación |
| `test/` | Solo tests |
| `chore/` | Mantenimiento, deps, config |

---

## Lo que NO existe en este repo

- **No hay rama `develop`** — main es el único trunk.
- **No hay rama `staging`** — los previews de Cloudflare (ramas no-main) sirven para revisar antes del merge.
- **No hay ramas permanentes de features** — cada rama es temporal, vive mientras dura el PR.

---

## Enforcement (barreras técnicas activas)

Las reglas anteriores están reforzadas por dos mecanismos técnicos — no son solo convenciones.

### Hook local pre-push
El archivo `scripts/hooks/pre-push` bloquea cualquier `git push origin main` con un
mensaje de error. Ya está instalado en este clon. En un clon nuevo, instalar con:

```bash
bash scripts/install-hooks.sh
```

### Branch protection en GitHub
Configurar una vez en el repositorio remoto (requiere hacerlo manualmente):

```bash
# 1. Proteger main: require PR, no force-push, no delete
gh api repos/josemperilla/Finanzas_personales/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

# 2. Borrar ramas automáticamente al mergear PR
gh api repos/josemperilla/Finanzas_personales \
  --method PATCH \
  --field delete_branch_on_merge=true
```

Con esto activo, GitHub rechaza cualquier push directo a `main` sin importar desde dónde venga (agente, terminal, web).

---

## Para agentes de IA

Al iniciar cualquier tarea de implementación:

1. Verificar rama actual: `git status -sb`
2. Si estás en `main`, crear rama de trabajo:
   ```bash
   git fetch origin && git checkout -b feat/descripcion origin/main
   ```
3. Desarrollar en la rama de trabajo.
4. Nunca `git push origin main` directamente.
5. Nunca `git reset --hard` en `main` sin confirmación explícita del usuario.
6. Al terminar: push de la rama + abrir PR.
