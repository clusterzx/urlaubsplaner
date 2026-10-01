# Urlaubsplaner als statische Web-App hinter nginx.
# Läuft ohne Root-Rechte und lauscht auf Port 6533.
FROM nginxinc/nginx-unprivileged:1.30-alpine

LABEL org.opencontainers.image.title="Urlaubsplaner" \
      org.opencontainers.image.description="Urlaub, EZA und Gleittage optimal um Feiertage legen – mit Szenarien und PDF-Export" \
      org.opencontainers.image.source="https://github.com/clusterzx/urlaubsplaner" \
      org.opencontainers.image.licenses="MIT"

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

COPY --chown=nginx:nginx index.html /usr/share/nginx/html/
COPY --chown=nginx:nginx css/ /usr/share/nginx/html/css/
COPY --chown=nginx:nginx js/ /usr/share/nginx/html/js/
COPY --chown=nginx:nginx vendor/ /usr/share/nginx/html/vendor/

EXPOSE 6533

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:6533/healthz || exit 1
