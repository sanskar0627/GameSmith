# GameSmith

GameSmith turns a game idea into a playable experience. Describe a world in a sentence, let the workspace shape the concept, and move from an early prompt to a game you can return to and play.

The product is built around a warm, tactile visual system: editorial typography, pixel details, dithered scenes, and an interface designed to make game creation feel focused rather than technical.

## Status

GameSmith is under active development. Authentication, the public landing experience, the protected workspace shell, game routes, billing foundations, and the visual design system are in place. Game generation and deeper workspace workflows are continuing to evolve.

## Stack

- [Next.js](https://nextjs.org/) 16 with the App Router
- [React](https://react.dev/) 19 and TypeScript
- [Clerk](https://clerk.com/) for authentication
- [AI SDK](https://ai-sdk.dev/) 7 with Anthropic, OpenAI, OpenRouter and Fal providers
- [PostgreSQL](https://www.postgresql.org/) 18 with [Drizzle ORM](https://orm.drizzle.team/)
- [Tailwind CSS](https://tailwindcss.com/) 4 with custom design tokens
- [shadcn/ui](https://ui.shadcn.com/) and Base UI primitives
- [Lucide](https://lucide.dev/) for interface icons
- ESLint for code quality

## Requirements

- Node.js 22.12 or newer
- npm
- Docker (for the local Postgres database)
- A Clerk application for local authentication

## Getting Started

Clone the repository and install dependencies:

```bash
git clone https://github.com/sanskar0627/GameSmith.git
cd GameSmith
npm install
```

Create a local environment file from the template and add the keys from your Clerk dashboard:

```bash
cp .env.example .env.local
```

Generate the key that encrypts users' saved API keys and put it in `KEY_ENCRYPTION_KEYS` (optional locally, where a fixed development key is used with a warning; required in production):

```bash
node -e "console.log('1:' + require('crypto').randomBytes(32).toString('base64'))"
```

To offer models paid with sparks, set the `PLATFORM_*` provider keys. Without them, users can still run models with their own keys (Settings > API keys).

Choose a password for the local database and put it in `.env.local` as `POSTGRES_PASSWORD` (any random string; `openssl rand -hex 16` works). Compose, the app and the tests all read it from there, so no password is committed.

Start Postgres and apply the database migrations:

```bash
npm run db:up
npm run db:migrate
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Signing in creates your user row on first visit; `GET /api/health` reports whether the app can reach the database.

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm run lint` | Run ESLint across the project |
| `npm run typecheck` | Type-check the project |
| `npm test` | Run the test suite against the `gamesmith_test` database |
| `npm run db:up` / `db:down` | Start or stop the local Postgres container |
| `npm run db:generate` | Write a SQL migration after changing `lib/db/schema.ts` |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build locally |

## Project Structure

```text
app/
	(site)/             Public marketing and entry pages
	(auth)/             Clerk sign-in and sign-up routes
	(app)/              Protected game workspace
	play/               Playable game routes
	design-system/      Development-only component and token preview
	api/                Route handlers (health, webhooks)
components/
	app/                Workspace UI and product features
	auth/               Authentication branding components
	dither/             Dither rendering and procedural scene utilities
	settings/           Account and billing settings UI
	ui/                 Shared interface primitives
docs/
	architecture.md     Architecture decisions and the phased delivery plan
drizzle/              SQL migrations (generated, committed)
lib/
	auth.ts             Server-side authentication boundaries
	db/                 Drizzle client and schema
	server/             Server-only data access (users, game access, webhooks)
tests/                Vitest integration tests (real Postgres)
public/               Static assets and standalone previews
proxy.ts              Clerk request middleware
```

## Authentication

Clerk middleware attaches authentication state to requests, but it is not the authorization boundary. Protected pages and server operations use the helpers in [`lib/auth.ts`](lib/auth.ts):

- `requireUser()` redirects signed-out visitors to Clerk sign-in.
- `requireApiUser()` throws an unauthorized error for API and server-action flows.

When adding protected resources, validate both authentication and resource ownership at the point where the resource is accessed. For games, use `requireGameAccess(gameId, "read" | "write")` from [`lib/server/games/access.ts`](lib/server/games/access.ts); it reports every denial as "not found".

### Provider keys (BYOK)

Users can save their own Anthropic, OpenAI, OpenRouter and Fal keys in Settings > API keys. A key is checked with a free provider request, encrypted with AES-256-GCM (bound to the user and provider) and stored in `provider_keys`; only its last 4 characters are ever shown. Plaintext keys stay on the server: see [`lib/server/keys.ts`](lib/server/keys.ts) and [`lib/server/ai/access.ts`](lib/server/ai/access.ts). The model catalog and prices live in [`lib/ai/models.ts`](lib/ai/models.ts).

To rotate the encryption key, put a new entry first in `KEY_ENCRYPTION_KEYS` and keep the old one after it (`2:<new>,1:<old>`). Saved keys are re-encrypted as they are next used.

### Sparks and payments

Agent work is paid in sparks (see [`lib/billing/pricing.ts`](lib/billing/pricing.ts) for plans, packs and the spark rate). Each user has a wallet with a monthly allowance and pack sparks; every change is a row in the append-only `spark_ledger`, written in the same transaction and keyed for idempotency. A run holds sparks when it starts and settles actual usage when it ends ([`lib/server/billing/runs.ts`](lib/server/billing/runs.ts)).

Payments go through [Polar](https://polar.sh). Create one product per offer (Forge and Studio monthly subscriptions, two sparks packs), put their ids and an organization access token in the `POLAR_*` variables, and add a webhook to `<app url>/api/webhooks/polar` for `order.paid`, `order.refunded` and the `subscription.*` events. Sparks are only granted by the verified webhook. Use `POLAR_SERVER=sandbox` until you go live.

### Game sandboxes

Each game runs in its own isolated container with a live preview. The app reaches them through the sandbox manager; see [`sandbox/README.md`](sandbox/README.md) for the security model, local setup (`npm run sandbox:build`, `sandbox:up`, `sandbox:smoke`) and the gVisor setup for the VM. Owner-only routes: `POST/GET/DELETE /api/games/:id/sandbox`, `GET /api/games/:id/files`, and `GET/PUT/DELETE /api/games/:id/files/<path>`.

### User sync

User rows are kept in sync two ways:

- **Webhook:** `POST /api/webhooks/clerk` handles `user.created`, `user.updated` and `user.deleted`. In the Clerk dashboard, add an endpoint for those events and put its signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`.
- **On first visit:** the app layout calls `ensureUser()`, which creates the row if the webhook has not arrived yet (or cannot reach your machine during local development).

## Design System

The development-only design system is available at `/design-system` while running locally. It documents and previews the Ember on Bone visual language, including typography, color tokens, controls, loading states, dither scenes, and agent feedback patterns.

The standalone preview at [`public/preview-demo.html`](public/preview-demo.html) can also be opened directly in a browser.

## Development Guidelines

- Keep server-side authorization close to the resource it protects.
- Reuse shared components from `components/ui` before introducing new primitives.
- Preserve the established Ember on Bone typography, spacing, color, and focus styles.
- Keep user-facing routes accessible with keyboard navigation and visible focus states.
- Run `npm run lint`, `npm run typecheck` and `npm test` before opening a pull request.
- Change the schema in `lib/db/schema.ts`, then run `npm run db:generate` and commit the migration.

## Deployment

Build and run the production app locally with:

```bash
npm run build
npm run start
```

Production runs on a self-managed VM with Docker Compose (Postgres, Redis, the app, the agent worker and isolated sandboxes). See [`docs/architecture.md`](docs/architecture.md) for the plan; the deployment runbook arrives in Phase 12.

## License

This project is currently private and not licensed for redistribution.
