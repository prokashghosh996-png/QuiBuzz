# Deploy QuiBuzz to Vercel and Render

The repository has a Render Blueprint for the backend and PostgreSQL. Deployment still requires signing in to your hosting accounts. Local `.data` quizzes are not transferred automatically.

1. Push `render.yaml` and the current application source to your GitHub repository.
2. In Render, choose **New → Blueprint**, select the repository, and review the two resources before deploying. `render.yaml` initially selects free plans. Free services can sleep and free databases expire; review the current limits at https://render.com/docs/free before running an event.
3. Wait for `quibuzz-db` and `quibuzz-api` to become ready. The database URL is connected automatically and migrations run at startup. Accounts replace operator keys. Set `NODE_ENV=production` and `COOKIE_SECURE=true` on an existing service; its start command must be `npm run db:migrate && npm start`.
4. Open `https://YOUR-BACKEND.onrender.com/api/health` and confirm it returns `"ok": true`, `"service": "quibuzz-api"` and `"authentication": "accounts"`. Also check `/api/auth/me`: it should return `{"user":null,"csrfToken":null}` without a session. If health still returns `operatorKeyRequired`, the backend is running old code.
5. In the local project, generate the Vercel configuration using your actual public backend URL:

   ```sh
   node scripts/configure-vercel.mjs https://YOUR-BACKEND.onrender.com
   ```

6. Authenticate and deploy from the project root:

   ```sh
   npx vercel login
   npx vercel --prod
   ```

   Alternatively, commit the generated `vercel.json` and import the repository in Vercel. It specifies Vite, the `dist` output directory, API forwarding to Render, and the SPA fallback for quiz/projector links.

7. Open the Vercel site, register a Quiz Master account, create a quiz, and verify saving, refresh, scoring and projector updates. The browser calls `/api` on the Vercel origin; Vercel forwards those requests to Render.

Deploy the updated backend to Render before the frontend so `/api/health` includes the service identifier. Vercel's `/api/:path*` rewrite must continue to precede the SPA fallback; no Vite API URL environment variable is required because the browser uses same-origin `/api` paths.

`.vercelignore` excludes local environment files, database files, dependencies and test artifacts from CLI uploads. No database credentials are needed on Vercel.

References: [Render Blueprints](https://render.com/docs/blueprint-spec), [Vercel CLI](https://vercel.com/docs/cli/deploy), [Vercel rewrites](https://vercel.com/docs/routing/rewrites).

## Upgrading an existing deployment to accounts

Deploy the current source to the existing Render backend before deploying the login frontend. In Render, verify the linked repository and branch, deploy the latest commit, and inspect the build/start logs. Use `npm ci --include=dev && npm run build` as the build command and `npm run db:migrate && npm start` as the start command. Keep the existing PostgreSQL `DATABASE_URL`; never use the local development database URL in Render.

Confirm the backend health and auth responses described above, then redeploy Vercel from the same source. The Vercel `/api/health` response should also include `authentication: "accounts"`. Existing quizzes need an owner assigned after registration; see [account migration](docs/accounts.md). Updating a local file or deploying Vercel alone does not update the separately hosted Render backend.
