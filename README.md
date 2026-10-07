# GameSmith

GameSmith turns a game idea into a playable experience. Describe a world in a sentence, let the workspace shape the concept, and move from an early prompt to a game you can return to and play.

The product is built around a warm, tactile visual system: editorial typography, pixel details, dithered scenes, and an interface designed to make game creation feel focused rather than technical.

## Status

GameSmith is under active development. Authentication, the public landing experience, the protected workspace shell, game routes, billing foundations, and the visual design system are in place. Game generation and deeper workspace workflows are continuing to evolve.

## Stack

- [Next.js](https://nextjs.org/) 16 with the App Router
- [React](https://react.dev/) 19 and TypeScript
- [Clerk](https://clerk.com/) for authentication
- [Tailwind CSS](https://tailwindcss.com/) 4 with custom design tokens
- [shadcn/ui](https://ui.shadcn.com/) and Base UI primitives
- [Lucide](https://lucide.dev/) for interface icons
- ESLint for code quality

## Requirements

- Node.js 20 or newer
- npm
- A Clerk application for local authentication

## Getting Started

Clone the repository and install dependencies:

```bash
git clone https://github.com/sanskar0627/GameSmith.git
cd GameSmith
npm install
```

Create a local environment file:

```bash
touch .env.local
```

Add the keys from your Clerk dashboard to `.env.local`:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

`NEXT_PUBLIC_APP_URL` is optional during local development. Set it to the deployed origin when generating production metadata and share URLs:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server with hot reload |
| `npm run lint` | Run ESLint across the project |
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
components/
	app/                Workspace UI and product features
	auth/               Authentication branding components
	dither/             Dither rendering and procedural scene utilities
	settings/           Account and billing settings UI
	ui/                 Shared interface primitives
lib/
	auth.ts             Server-side authentication boundaries
public/               Static assets and standalone previews
proxy.ts              Clerk request middleware
```

## Authentication

Clerk middleware attaches authentication state to requests, but it is not the authorization boundary. Protected pages and server operations use the helpers in [`lib/auth.ts`](lib/auth.ts):

- `requireUser()` redirects signed-out visitors to Clerk sign-in.
- `requireApiUser()` throws an unauthorized error for API and server-action flows.

When adding protected resources, validate both authentication and resource ownership at the point where the resource is accessed.

## Design System

The development-only design system is available at `/design-system` while running locally. It documents and previews the Ember on Bone visual language, including typography, color tokens, controls, loading states, dither scenes, and agent feedback patterns.

The standalone preview at [`public/preview-demo.html`](public/preview-demo.html) can also be opened directly in a browser.

## Development Guidelines

- Keep server-side authorization close to the resource it protects.
- Reuse shared components from `components/ui` before introducing new primitives.
- Preserve the established Ember on Bone typography, spacing, color, and focus styles.
- Keep user-facing routes accessible with keyboard navigation and visible focus states.
- Run `npm run lint` before opening a pull request.

## Deployment

Build and run the production app locally with:

```bash
npm run build
npm run start
```

For a hosted deployment, configure the Clerk production keys and set `NEXT_PUBLIC_APP_URL` to the final HTTPS origin. Vercel is a natural deployment target for this Next.js application.

## License

This project is currently private and not licensed for redistribution.
