# Deploy QuiBuzz to Vercel and Render

The repository has a Render Blueprint for the backend and PostgreSQL. Deployment still requires signing in to your hosting accounts. Local `.data` quizzes are not transferred automatically.

1. Push `render.yaml` and the current application source to your GitHub repository.
2. In Render, choose **New → Blueprint**, select the repository, and review the two resources before deploying. `render.yaml` initially selects free plans. Free services can sleep and free databases expire; review the current limits at https://render.com/docs/free before running an event.
3. Wait for `quibuzz-db` and `quibuzz-api` to become ready. The database URL is connected automatically, migrations run at startup, and an operator key is generated. Obtain that key from the Render service's environment settings; do not commit it or put it in Vercel frontend variables.
4. Open `https://YOUR-BACKEND.onrender.com/api/health` and confirm it returns `"ok": true`.
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

7. Open the Vercel site, enter the Render operator key through the key icon, create a quiz, and verify saving, refresh, scoring and projector updates. The browser calls `/api` on the Vercel origin; Vercel forwards those requests to Render.

`.vercelignore` excludes local environment files, database files, dependencies and test artifacts from CLI uploads. No database credentials are needed on Vercel.

References: [Render Blueprints](https://render.com/docs/blueprint-spec), [Vercel CLI](https://vercel.com/docs/cli/deploy), [Vercel rewrites](https://vercel.com/docs/routing/rewrites).
