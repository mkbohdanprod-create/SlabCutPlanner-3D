#!/bin/sh
# Генерує self-signed cert лише якщо його ще немає (cert живе у volume
# tls-certs і переживає рестарти). Cloudflare у режимі Full приймає будь-який.
set -e

CERT_DIR=/etc/nginx/certs
if [ ! -f "$CERT_DIR/server.crt" ]; then
  mkdir -p "$CERT_DIR"
  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$CERT_DIR/server.key" \
    -out "$CERT_DIR/server.crt" \
    -subj "/CN=${SERVER_DOMAIN:-localhost}"
  echo "Згенеровано self-signed cert для CN=${SERVER_DOMAIN:-localhost}"
fi

# Стандартний entrypoint nginx-образу (envsubst-шаблони, ipv6 тощо)
exec /docker-entrypoint.sh nginx -g 'daemon off;'
