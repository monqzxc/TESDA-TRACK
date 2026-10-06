#!/bin/sh
# Runs once, when the database volume is first created. The app gets its own non-superuser role;
# extensions live in their own schema so the app (and test runs) can rebuild "public" freely.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v app_password="$APP_DB_PASSWORD" <<'EOSQL'
CREATE ROLE tesda_track LOGIN PASSWORD :'app_password';
EOSQL

create_database() {
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -v db="$1" <<'EOSQL'
CREATE DATABASE :"db" OWNER tesda_track;
ALTER DATABASE :"db" SET search_path = "$user", public, extensions;
EOSQL
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$1" <<'EOSQL'
CREATE SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO tesda_track;
CREATE EXTENSION postgis SCHEMA extensions;
CREATE EXTENSION vector SCHEMA extensions;
EOSQL
}

create_database tesda_track
if [ "${CREATE_TEST_DATABASE:-false}" = "true" ]; then
    create_database tesda_track_test
fi
