#!/bin/sh
# Runs once, when the database volume is first created. The app gets its own non-superuser role.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$APP_DB_PASSWORD" <<'EOSQL'
CREATE ROLE tesda_track LOGIN PASSWORD :'app_password';
CREATE DATABASE tesda_track OWNER tesda_track;
EOSQL
