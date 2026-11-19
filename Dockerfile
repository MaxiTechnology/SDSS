FROM node:24-bookworm-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/index.html frontend/tsconfig.json ./
COPY frontend/src ./src
COPY frontend/public ./public
RUN npm run build

FROM python:3.14-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY backend/requirements-lock.txt ./requirements-lock.txt
RUN pip install --no-cache-dir -r requirements-lock.txt
RUN useradd --create-home --uid 10001 ssdss
COPY backend/*.py ./
COPY backend/assets ./assets
COPY --from=frontend /build/dist ./frontend_dist
COPY deploy/start.sh ./start.sh
RUN chmod 755 start.sh
USER ssdss
EXPOSE 10000
CMD ["/bin/sh", "/app/start.sh"]
