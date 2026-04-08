#!/bin/sh
set -e

echo "── FinDB API ──────────────────────────────────────"
echo "Controleer databaseverbinding..."

# Wacht tot PostgreSQL klaar is (max 30 seconden)
attempts=0
until python -c "
import os, sys
from sqlalchemy import create_engine, text
try:
    engine = create_engine(os.environ['DATABASE_URL'])
    with engine.connect() as c:
        c.execute(text('SELECT 1'))
    sys.exit(0)
except Exception as e:
    print(f'  Wachten op database: {e}')
    sys.exit(1)
"; do
  attempts=$((attempts + 1))
  if [ $attempts -ge 15 ]; then
    echo "FOUT: database niet bereikbaar na 30 seconden"
    exit 1
  fi
  sleep 2
done

echo "Database bereikbaar. Migraties uitvoeren..."
alembic upgrade head
echo "Migraties voltooid."
echo "────────────────────────────────────────────────────"

exec uvicorn app.api:app --host 0.0.0.0 --port 8000
