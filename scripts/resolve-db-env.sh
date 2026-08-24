#!/bin/sh
# Distintos proveedores de Postgres en Vercel (Vercel Postgres nativo, Neon vía
# Marketplace, etc.) exponen la connection string bajo nombres distintos, y a
# veces dejan alguna variable definida pero vacía en vez de no definirla. Este
# script normaliza todo a POSTGRES_PRISMA_URL (pooled) y POSTGRES_URL_NON_POOLING
# (directa), que es lo que espera prisma/schema.prisma, probando alternativas
# conocidas en orden hasta encontrar una no vacía.

pick() {
  for v in "$@"; do
    val=$(eval "printf '%s' \"\${$v:-}\"")
    if [ -n "$val" ]; then
      printf '%s' "$val"
      return 0
    fi
  done
  return 1
}

POOLED=$(pick POSTGRES_PRISMA_URL POSTGRES_URL DATABASE_URL) || true
DIRECT=$(pick POSTGRES_URL_NON_POOLING DATABASE_URL_UNPOOLED POSTGRES_URL_NO_SSL) || true

if [ -z "$DIRECT" ]; then
  DIRECT="$POOLED"
fi

export POSTGRES_PRISMA_URL="$POOLED"
export POSTGRES_URL_NON_POOLING="$DIRECT"

if [ -z "$POSTGRES_PRISMA_URL" ]; then
  echo "resolve-db-env: no se encontró ninguna connection string de Postgres en las env vars (POSTGRES_PRISMA_URL / POSTGRES_URL / DATABASE_URL). Conectá el storage de Postgres al proyecto en Vercel." >&2
  exit 1
fi

echo "resolve-db-env: usando POSTGRES_PRISMA_URL/POSTGRES_URL_NON_POOLING resueltas correctamente."
