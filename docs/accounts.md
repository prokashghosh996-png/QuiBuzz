# Quiz Master accounts

Each Quiz Master registers with a name, email **or** international phone number (for example +919876543210), and a password of at least 8 characters. Quizzes and demos belong to the signed-in account. Another account cannot list, open, score, edit, or delete them. Operator keys are no longer used.

Passwords use Argon2id. Sessions expire after seven days, use HttpOnly/SameSite cookies, and are revoked on sign-out. Mutations require a session-specific CSRF token. Authentication attempts are throttled in PostgreSQL. Use HTTPS in production; `NODE_ENV=production` always enables Secure cookies. Frontend requests must proxy `/api` to the backend on the same browser origin, as the existing Vite and Vercel configuration does. Throttling conservatively uses the socket IP; users behind the same reverse proxy share its IP quota.

## Existing installations

Back up the production database, install dependencies, and apply the additive migration before starting the new server:

```sh
npm ci
npm run db:migrate
npm run build
npm start
```

The migration preserves existing quizzes, teams, and scores. Existing quizzes initially have no owner and are hidden from all account dashboards. Register the intended account, then preview assignment using the server's database configuration:

```sh
npx tsx scripts/assign-legacy-quizzes.ts host@example.com
npx tsx scripts/assign-legacy-quizzes.ts host@example.com --quiz QUIZ_ID
```

Add `--apply` to perform the displayed assignment. Without `--quiz`, this assigns all currently unowned quizzes. It never transfers an already owned quiz. Seeded quizzes also need assignment. The local development database migration has been applied; production migration and assignment must be performed against the intended deployment database.

## Scope

Signup accepts one login identifier: email or phone. Phone numbers require a country code. This version does not send verification messages or offer password recovery; email/SMS delivery and recovery flows require a separate setup. Keep account credentials safe. Public projector URLs permit anyone with the URL to view audience scores, including player names, but expose no scoring controls. They do not require a Quiz Master login.
