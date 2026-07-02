#!/bin/sh
# Instala los git hooks del repo en el clon local.
# Ejecutar una vez después de clonar: bash scripts/install-hooks.sh

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Error: no estás dentro de un repositorio git."
  exit 1
fi

HOOKS_SRC="$REPO_ROOT/scripts/hooks"
HOOKS_DST="$REPO_ROOT/.git/hooks"

for hook in "$HOOKS_SRC"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$HOOKS_DST/$name"
  chmod +x "$HOOKS_DST/$name"
  echo "Hook instalado: $name"
done

echo "Listo. Hooks activos en .git/hooks/"
