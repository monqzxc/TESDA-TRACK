# Railway (demo deployment)

[`railway.ts`](railway.ts) describes the Railway project with Railway's Infrastructure as Code: PostgreSQL with PostGIS
and pgvector (`db`, built from `deploy/postgres`, with a volume) and the API (`api`, built from `backend/`). Vercel
serves the React app and passes `/api/*` to the API ([`frontend/vercel.json`](../frontend/vercel.json)), so the app and
the API share an origin and cookie sign-in works. The Streamlit app (`classic/`) isn't deployed here.

## Which plan

- **Hobby** ($5 a month, which includes $5 of usage) runs everything, semantic search included. A week of the demo uses
  about $3.
- **Trial** ($5 of credit, at most 1 GB of memory per service) is too small for the embedding model: the API holds about
  1 GB with it loaded, and embedding the catalog takes more. On the trial, set `SEMANTIC_SEARCH_ENABLED` to `"false"`
  in `railway.ts` (matching uses keywords only). Verify your GitHub account at railway.com/verify first: unverified
  trials block outgoing connections, which Skills Bridge lookups and directions need.

## First-time setup

Run these from the repository root.

1. Install the Railway CLI (5.42.1 or newer) and sign in:

   ```bash
   npm i -g @railway/cli
   railway login
   ```

2. Create the project, named as in `railway.ts`. This links the repository folder to it:

   ```bash
   railway init --name tesda-track
   ```

3. In the Railway dashboard, open the project's **Settings → Shared Variables** and add:

   | Variable | Value |
   |---|---|
   | `SECRET_KEY` | a new secret |
   | `POSTGRES_PASSWORD` | a new secret |
   | `APP_DB_PASSWORD` | a new secret |
   | `CARTO_API` | your CARTO basemaps key (also allow the Vercel domain in CARTO) |

   Generate each secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. These are URL-safe, which
   matters for `APP_DB_PASSWORD` because it goes into the API's `DATABASE_URL`. The database passwords take effect only
   when the volume is first created.

4. Make sure Railway's GitHub app can read `monqzxc/TESDA-TRACK` (Railway asks when you first connect GitHub).

5. Install the SDK, preview, then apply:

   ```bash
   npm ci --prefix .railway
   railway config plan
   railway config apply
   ```

   Railway builds both services. The API's first build downloads the embedding model into its image, so it takes a
   while. Before the API starts, its pre-deploy step runs the migrations, the seed and the embedding sync, like the
   `migrate` job in `docker-compose.yml`.

6. Give the API a public address:

   ```bash
   railway domain --service api --port 8000
   ```

7. Put that address in `frontend/vercel.json`, replacing `replace-with-your-railway-api-domain.invalid`. Commit and
   push, and Vercel redeploys the React app.

8. Check `https://<api-domain>/api/docs`, then open the Vercel site and sign in.

To create an administrator, open a shell in the API's container and run the CLI there. It asks for the password:

```bash
railway ssh --service api
python -m tesda_track.cli create-admin --email you@example.com --name "Your Name"
```

## After setup

- Pushes to `main` redeploy only the service whose folder changed (`/backend/**` or `/deploy/postgres/**`).
- Change settings in `railway.ts` and apply them with `railway config plan` and `railway config apply`. Apply deletes
  variables that are set only in the dashboard, so declare new ones in the file.
- Logs: `railway logs --service api`.

## Troubleshooting

- **`node failed to evaluate IaC file` with `throw new Error(MINIMUM_IAC_CLI_MESSAGE)` on Windows**: the SDK checks the
  CLI by running `railway --version` without a shell, which finds only `.exe` files, and the npm install puts only
  `railway.cmd` and `railway.ps1` on PATH. In PowerShell, point the SDK at the real program for the session, then run
  the command again:

  ```powershell
  $env:_ = "$env:APPDATA\npm\node_modules\@railway\cli\bin\railway.exe"
  ```

  Or install the CLI with `scoop install railway` instead, which puts a `railway.exe` on PATH.
- **The API's first deploy fails in pre-deploy with "connection refused"**: the database was still starting. Run
  `railway redeploy --service api`.
- **`password authentication failed for user "tesda_track"`**: `APP_DB_PASSWORD` changed after the volume was created.
  The database keeps the first password.
- **The API restarts over and over, or the logs say it ran out of memory**: the plan's memory is too small for the
  embedding model. See [Which plan](#which-plan).
- **Apply refuses the region**: delete the `replicas` lines and the volume's `region` in `railway.ts` to use Railway's
  default region.
