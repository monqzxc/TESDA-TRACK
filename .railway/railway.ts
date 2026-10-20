// The demo deployment on Railway: PostgreSQL (with PostGIS and pgvector) and the API, both built from this repository.
// Vercel serves the React app and passes /api/* here (frontend/vercel.json). First-time setup: .railway/README.md.
// Preview changes with `railway config plan`, then `railway config apply`. Apply treats this file as the whole truth:
// a variable set only in the dashboard is deleted, so declare it here.
import { defineRailway, github, project, service, volume } from "railway/iac";

const REPO = "monqzxc/TESDA-TRACK";
// Singapore, the closest region to the Philippines. The database volume stays in its service's region.
const REGION = "asia-southeast1-eqsg3a";

export default defineRailway((ctx) => {
  // Secrets are the project's shared variables, set by hand before the first apply, so they never appear in this
  // file. ctx.randomString is no substitute: it hashes the environment name, so anyone reading this file could
  // work it out.
  const shared = ctx.shared;

  // deploy/postgres, the image docker-compose.yml uses: Railway's own PostgreSQL has no PostGIS. Its init script
  // creates the tesda_track role and database the first time the volume is empty. It has no public domain; only the
  // API reaches it, over the private network.
  const pgdata = volume("pgdata", { region: REGION });
  const db = service("db", {
    source: github(REPO, { branch: "main", rootDirectory: "deploy/postgres" }),
    // Watch paths start at the repository root, whatever the root directory.
    build: { builder: "DOCKERFILE", watchPatterns: ["/deploy/postgres/**"] },
    replicas: { [REGION]: 1 },
    env: {
      POSTGRES_PASSWORD: shared.POSTGRES_PASSWORD,
      APP_DB_PASSWORD: shared.APP_DB_PASSWORD,
      // A new volume holds lost+found, and PostgreSQL only initializes an empty directory.
      PGDATA: "/var/lib/postgresql/data/pgdata",
    },
    volumeMounts: { "/var/lib/postgresql/data": pgdata },
  });

  const api = service("api", {
    source: github(REPO, { branch: "main", rootDirectory: "backend" }),
    build: { builder: "DOCKERFILE", watchPatterns: ["/backend/**"] },
    replicas: { [REGION]: 1 },
    // docker-compose.yml's migrate job. As there, a failed embedding sync doesn't stop the deploy: matching falls back
    // to keywords until the next one.
    preDeploy: `/bin/sh -c "alembic upgrade head && python -m tesda_track.seed && (python -m tesda_track.embeddings sync || echo 'WARNING: embeddings not synced')"`,
    healthcheck: "/health",
    env: {
      ENVIRONMENT: "production",
      // The image listens on 8000, and Railway's health check and generated domain go to PORT.
      PORT: "8000",
      SECRET_KEY: shared.SECRET_KEY,
      DATABASE_URL: "postgresql+psycopg://tesda_track:${{shared.APP_DB_PASSWORD}}@${{db.RAILWAY_PRIVATE_DOMAIN}}:5432/tesda_track",
      // The model takes about 1 GB to serve and more to embed the catalog, which is over the trial plan's 1 GB per
      // service. On the trial, set this to "false": matching then uses keywords only.
      SEMANTIC_SEARCH_ENABLED: "true",
      // The CARTO basemaps key for the center map (see .env.example). Allow the Vercel domain in CARTO.
      CARTO_API: shared.CARTO_API,
    },
  });

  return project("tesda-track", { resources: [pgdata, db, api] });
});
