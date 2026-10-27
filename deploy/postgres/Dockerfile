# PostgreSQL 17 with pgvector (semantic search) and PostGIS (geographic search).
FROM pgvector/pgvector:pg17

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-postgis-3 \
    && rm -rf /var/lib/apt/lists/*

COPY 20-tesda-track.sh /docker-entrypoint-initdb.d/
