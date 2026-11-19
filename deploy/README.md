# Independent SSDSS deployment preparation

Hosting is controlled by the owner, not ChatGPT: Render runs the Linux web service; a separate Neon project holds deployment accounts, procurement data and evidence. The existing local demo database must not be reused. No hosting account, service, database or public URL has been created by these files.

## Proposed service

`Dockerfile` builds React using the committed npm lockfile, then serves its output and the existing FastAPI routes from one Python 3.14 container. `production:app` requires an explicit TLS PostgreSQL URL and exact HTTPS origin; it cannot silently use ignored local settings. The container runs as a non-root user. Secrets, Windows environments and test outputs are excluded from the Docker context. Existing hash routes continue to work at `https://<actual-service-host>/#/dashboard`.

`render.yaml` is an optional Blueprint for a **Free demonstration** service, with automatic deploys disabled. Review its settings before importing it. Render's free service sleeps after 15 idle minutes and may take about one minute to wake; it is unsuitable for a dependable always-on production service. A paid instance is a separate owner decision. Free-tier quotas may suspend service or builds; review billing before adding a payment method. Do not create Render's expiring free database for durable SSDSS storage; use the separate Neon project instead.

Sources checked during preparation: [Render web services](https://render.com/docs/web-services), [free-tier limitations](https://render.com/docs/free), [Blueprint fields](https://render.com/docs/blueprint-spec), [Neon connection strings](https://neon.com/docs/connect/connect-from-any-app).

## Before publishing

1. Owner creates/signs into their own Render account and grants repository access only to the SSDSS repository. Owner creates a separate Neon project in a region close to the chosen web service; no demo branch clone or account copying is needed.
2. Privately copy that new project's connection URL, retaining `sslmode=require` and any recommended channel-binding setting. Do not paste it into chat, commit it, or place it in frontend variables. All values below go into the hosting dashboard's secret environment settings.
3. Prepare the separate database and first administrator privately from Ubuntu, in the repository's backend directory:

   ```bash
   ~/.venvs/ssdss-backend/bin/python deployment_setup.py
   ```

   Enter the **deployment** URL and administrator credentials at the hidden terminal prompts. This tool stops if accounts already exist, validates account fields before migration, applies migrations and creates the first administrator. It never changes local settings files. A failed bootstrap after migration may leave empty tables; rerunning setup is allowed while no accounts exist. Future migrations are a separate reviewed operation after a backup, not this first-account tool.
4. Build and test the Linux image before publishing:

   ```bash
   docker build -t ssdss:deployment .
   ```

   No Docker installation is currently available in the agent environment, and the agent cannot access the user's WSL distribution. Container execution and Linux application checks remain pending. The owner's existing Ubuntu server does not establish that this new container has been tested.
5. Create the web service in Render using Docker, repository root context, and health check `/api/health`. Keep automatic deployments off until the first release passes checks. Set:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | New deployment Neon URL, entered privately |
   | `SDSS_ALLOWED_ORIGINS` | `render` to use the assigned Render HTTPS URL automatically; use the exact HTTPS origin instead if adding a custom domain |
   | `CLOUDFLARE_ACCOUNT_ID` | Optional AI account ID, entered privately |
   | `CLOUDFLARE_API_TOKEN` | Optional scoped AI token, entered privately |

   The `render` origin mode accepts only the platform-provided `RENDER_EXTERNAL_URL` while `RENDER=true`, validates it as an exact HTTPS onrender.com origin and resolves it before authentication loads. It never uses request headers or a wildcard. The service host is assigned by Render. Do not assume `ssdss-demo.onrender.com` is available. `PORT` is supplied by the host. Never set the deployed origin to localhost.
6. Proxy configuration is an explicit release check. `FORWARDED_ALLOW_IPS` defaults to localhost only; verify Render's trusted proxy chain before changing it. Do not blindly use `*`. Without correct client-IP handling, multiple users behind the proxy may share the login IP attempt bucket. Verify rate limits with two clients and forged forwarding headers before treating this as a production release. [Uvicorn proxy guidance](https://www.uvicorn.org/deployment/#proxies-and-forwarded-headers).
7. Confirm HTTPS sign-in/sign-out, Secure/HttpOnly/SameSite cookies, role restrictions, password changes/session revocation, create/reopen project, evidence upload/download, PDF export and the AI consent path. Confirm the separate deployment database starts empty, and that the local demo still has its original three projects. API health alone does not validate the database or login.

## Updates and recovery

Review changes locally, run checks and push to GitHub. Take a Neon backup or recovery point before schema changes, apply reviewed migrations to the deployment database, then manually deploy the selected commit in Render. Application rollback does not reverse database migrations. Never delete deployment tables to fix a failed build. Existing uploads are stored in PostgreSQL, not on the container filesystem. Establish database backup retention, restore verification and owner-account recovery before real procurement use.

Preparation validation: deployment configuration tests cover mandatory explicit database settings, TLS and exact HTTPS origins. Full image build, hosted authentication/proxy checks, backup/restore and owner acceptance remain required. No paid resource or public deployment is authorized by the mere presence of this configuration.
