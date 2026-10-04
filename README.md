# QuiBuzz

A light, responsive control room for the final round of an on-stage quiz. The quiz master operates fixed team cards while an independent audience window shows a live leaderboard. This is a scorekeeping application; it does not host MCQ questions or accept contestant submissions.

## Features

- Six-step setup: quiz, dynamic teams/members, quiz master, dynamic rounds, scoring, review.
- Database-backed setup drafts with a browser recovery cache for edits still being saved.
- Independent Direct, Bonus, Pounce correct and Pounce wrong scoring for every team on the same question.
- Manual current/next team selection, bounce recipient, reversible rotation and arbitrary team reordering.
- Per-question direct/next/bounce assignments restored when revisiting a question.
- Per-round and cumulative totals derived from an event ledger, never a mutable score counter.
- Chronological score history, undo, traceable edits/removals and signed manual adjustments.
- Persistent timer with start/pause/reset, configurable duration, and a visible TIME UP state.
- Dedicated projector route, polling database state every two seconds, with no score/edit/delete controls.
- Round summaries, final results, shared ranks for ties, tie-break questions and CSV results export.
- Database transactions, idempotent scoring commands, version conflicts, safe retries, and refresh recovery.
- Touch-friendly mobile layouts down to 320px, keyboard navigation and reduced-motion support.

## Stack

React 19, TypeScript, Vite, plain responsive CSS, Lucide icons, Express 5, Zod, PostgreSQL and Prisma 6. No external accounts or online services are needed to run a quiz. Fonts are bundled locally, with system-font fallbacks; the UI makes no external font requests.

## Install and run

Use Node.js 22.12+ or 24 LTS. From this directory:

```sh
npm install
```

Copy `.env.example` to `.env`:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```sh
# macOS / Linux
cp .env.example .env
```

### Database — choose one

**Option A: bundled local PostgreSQL (no Docker needed)**

In a separate terminal, run:

```sh
npm run db:local
```

Keep that terminal running. It starts an actual PostgreSQL server on `127.0.0.1:54329`, and stores its cluster in `.data/postgres`. It reuses that directory on later launches. Do not delete `.data` if you want to keep your quizzes. Stop it gracefully with Ctrl+C. This option is intended for a single-machine development/event setup; run it as a normal, non-root user. Only one local database launcher may run at a time.

**Option B: Docker PostgreSQL**

```sh
docker compose up -d db
```

Docker uses the same port/credentials as `.env.example` and stores data in the `quibuzz_data` named volume. Do not run Options A and B on the same port simultaneously. `docker compose down` retains data; deleting the volume deletes data.

**Option C: your PostgreSQL server**

Set `DATABASE_URL` in `.env` to a PostgreSQL connection string. The application uses ordinary PostgreSQL and does not depend on the local database launcher.

### Apply schema and start

With PostgreSQL running:

```sh
npm run db:migrate
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` requests to Express on port 3001. Create a quiz, or select **Try a demo** to create an independent demo with six teams and sample score events. The demo is clearly opt-in and uses the same real database/API as any quiz.

Optional CLI seed:

```sh
npm run db:seed
```

Each seed invocation creates a new demo; it never replaces existing quizzes.

## Environment

| Variable       | Purpose                                      |
| -------------- | -------------------------------------------- |
| `DATABASE_URL` | Required PostgreSQL connection string        |
| `PORT`         | Express port, default `3001`                 |
| `HOST`         | Express listen address, default `0.0.0.0`    |
| `OPERATOR_KEY` | Optional shared key for all write operations |

If `OPERATOR_KEY` is configured, use the key icon in the top bar to enter it. It is kept in that browser tab's session storage. Read-only API/projector access stays public. This is a small event-control application with optional shared operator access, not a multi-tenant identity platform. Use trusted event Wi-Fi; use HTTPS and an operator key when exposing it outside that network. The development database binds to localhost only.

On another device on the same local network, open `http://<host-computer-LAN-IP>:5173`. The computer running the server must stay on, and the firewall must allow the app port. A phone browser and projector can use separate devices on this network. Internet access is not required once dependencies are installed. Local database failures disable further writes until the unconfirmed command has been retried.

## Production build

```sh
npm run build
npm run db:migrate
npm start
```

Open **http://localhost:3001**. Express serves the compiled frontend and API from one origin. Keep your chosen PostgreSQL service running. Configure production credentials in `.env` or your service environment. Use a process supervisor and standard PostgreSQL backups for sustained deployments.

## Quiz workflow

1. Create a quiz and choose the team/round counts.
2. Add an optional team name and any number of required member names per team.
3. Enter the quiz master's name, round names/question counts and scoring rules.
4. Review and start. Setup is locked once scoring begins.
5. Award scores without advancing the question. Other teams may score pounces on that same question.
6. Check/override the next direct team, then select **Next question**.
7. Complete the round to review round-wise and cumulative scores. Reverse/reorder teams before starting the next round if needed.
8. Display final results, export CSV, continue the quiz, or add a one-question tie-break round. Equal totals get the same competition rank (for example 1, 1, 3); no winner is invented.

The two operator routes are `/` (quizzes) and `/quiz/:id` (setup/dashboard, based on persisted status). The public presentation route is `/projector/:id`. The Projector mode button opens it in another tab so the dashboard remains available.

### Direct, Bonus/Bounce and Pounce

- **Direct** awards the configured positive marks for a team's own question and sets the next direct team to the team after the recipient in the current rotation, wrapping to the first team when needed. You can override this selection before advancing.
- **Bounce** records the recipient of a manually passed question; it does not award points. **Bonus** awards positive marks and suggests the team after the successful recipient as the next direct team. That suggestion can always be overridden.
- **Pounce** is an independent attempt by another team. Correct pounces award positive marks. Wrong pounces deduct the configured penalty. Any number of teams may receive events on the same question.
- Default scoring is **+10 / −5**. Enter the negative penalty as `5`, not `-5`. Existing events retain their original marks when rules change; future events use the new values.
- Scoring never advances the question. Scoring cards do not reorder when scores change; the leaderboard sorts separately.
- The timer never scores or advances a question. A refresh restores its deadline. Pausing uses server time rather than a browser decrement counter. Expiry plays a short two-tone alert in the operator window after a click or keypress has enabled browser audio; the projector stays silent.
- Direct scoring is enabled only for the current direct team, and Bonus plus both Pounce buttons are disabled for that team. These restrictions are enforced by the API. Pounce actions remain available for the other teams, so multiple teams can still score on the same question.
- Each round has a quiz-master name in setup (blank uses the main quiz master). The live round's name can also be changed using **Quiz master for this round → Save QM**. Each round's saved name is independent and appears on the projector.

### Corrections and recovery

**Undo last score** removes the latest active scoring entry, regardless of the current question. It does not undo team navigation or bounce suggestions. Check the next-team selector after undoing a bonus if necessary.

Use **Score history** to edit or remove an older entry with a reason. Editing voids the original and appends a linked replacement. Manual adjustment is available through a team card's edit icon or by clicking its total, then **Edit score / adjustment**. Adjustments apply to the current round/question; correct an older round through that round's history entries.

Restart and reset scores void events rather than erasing history. Only confirmed **Delete quiz** permanently removes the quiz and its records. Tie-break rounds are retained by restart.

Every mutation contains a request UUID and expected quiz version. A PostgreSQL row lock serializes writes. Replaying an accepted UUID cannot double-award points. A stale operator window receives a conflict and loads fresh state. If a network response is lost, the pending action is retained in session storage; **Retry last action** reuses the same UUID. Further writes are blocked until that action is resolved. Never assume a score is accepted until saving finishes.

Setup drafts are saved after a short pause and on review. A browser draft cache recovers typing that has not reached the database. Started quizzes, navigation, team order, timer state, events, status and totals all come from PostgreSQL.

### Keyboard controls

When focus is outside inputs/buttons/dialogs: **← / →** moves between questions in the current round; **Space** starts or pauses the timer. No scoring shortcuts are registered. All keyboard actions have visible button equivalents.

## Validation and tests

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Integration tests require the configured PostgreSQL database with migrations applied. Each test creates its own quiz and removes only that quiz. They cover the D → E bonus → F sequence, simultaneous pounces, immutable previous marks, idempotency, concurrent version conflicts, undo, corrections, ordering, timer persistence, per-round totals, ties and tie-breaks.

Browser tests (database and development server must be running):

```sh
npx playwright install chromium
npm run test:e2e
```

## Project structure

```text
prisma/                 Schema, SQL migration and opt-in demo seed
scripts/local-db.ts     Persistent local PostgreSQL launcher
server/db.ts            Prisma client
server/service.ts       Transactional command handlers and demo creation
server/index.ts         REST API, access checks, errors, production static files
shared/types.ts         Quiz types, score totals, rankings and state helpers
shared/validation.ts    Shared Zod setup and command validation
src/useQuiz.ts          Polling, command versioning and safe retry recovery
src/components/        Setup, scoring, controls, history, results and projector
src/styles.css          Responsive light UI and large-screen display
tests/                  Integration and browser workflow tests
```

`Quiz` stores metadata, status, a setup draft and navigation/timer state. `Team` and `Round` are normalized records. `ScoreEvent` stores each award, penalty or correction, with a monotonic sequence for reliable ordering. `Command` keeps idempotency keys and operation payloads, including void/reset actions. Team/round totals are computed from active events in both the control and projector views.

## Reference documentation

- [Vite development/build guide](https://vite.dev/guide/)
- [Prisma 6 migration deployment](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/deploy-migrations-from-a-local-environment)

Prisma is deliberately pinned to version 6; use the checked-in package lock and the commands above rather than mixing migration commands from other major versions.
