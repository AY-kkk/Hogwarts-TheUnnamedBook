FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3000 \
    MODEL_CONFIG_DB_PATH=/app/data/model-config.db

WORKDIR /app

RUN useradd --create-home --uid 10001 appuser

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/prompts ./backend/prompts
COPY system_core_rules.md system_prologue_rules.md ./

RUN mkdir -p /app/data && chown -R appuser:appuser /app/data

USER appuser

VOLUME ["/app/data"]

EXPOSE 3000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000}"]
