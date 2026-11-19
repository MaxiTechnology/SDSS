#!/bin/sh
set -eu
: "${DATABASE_URL:?Set the separate deployment database URL}"
: "${SDSS_ALLOWED_ORIGINS:?Set the exact HTTPS application origin}"
# Schema changes are an explicit operator step, not an automatic side effect of
# starting or rolling back an application image.
exec python -m uvicorn production:app --host 0.0.0.0 --port "${PORT:-10000}" --workers 1 --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-127.0.0.1}"
