# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — dependency installation
# Aikido Safe Chain intercepts pip at install time and checks every package
# for malware before it is written to disk.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS deps

WORKDIR /app

# System build dependencies (kept minimal; removed in final stage)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl \
        gcc \
        libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Aikido Safe Chain with CI shims so it wraps pip automatically
RUN curl -fsSL https://github.com/AikidoSec/safe-chain/releases/download/1.5.12/install-safe-chain.sh \
    | sh -s -- --ci

# Install Python dependencies — every package is scanned before installation
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — runtime image
# Copies only the installed site-packages and app code; does not include
# build tools, gcc, or the Safe Chain binary.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /app

# Runtime system dependency only (libpq for psycopg2)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from the deps stage
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin

# Copy application source
COPY . .

# Collect static files (failures are non-fatal; DB may not be up at build time)
RUN python manage.py collectstatic --noinput || true

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["gunicorn", "backend.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--worker-class", "gthread", "--threads", "4"]
