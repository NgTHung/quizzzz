# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Configuration

- **Language**: TypeScript
- **Framework**: SvelteKit with Svelte 5 (runes mode enforced for all non-`node_modules` files)
- **Package Manager**: npm
- **Add-ons**: tailwindcss, devtools-json, drizzle, mcp

## Commands

```sh
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # Type-check with svelte-check
npm run check:watch  # Type-check in watch mode

npm run db:push      # Push schema changes to DB (no migration file)
npm run db:generate  # Generate migration files from schema
npm run db:migrate   # Run pending migrations
npm run db:studio    # Open Drizzle Studio (DB GUI)
```

## Architecture

### Stack
- **SvelteKit** with `adapter-auto`
- **TailwindCSS v4** (via `@tailwindcss/vite` plugin) + `@tailwindcss/typography`
- **Drizzle ORM** with `postgres.js` driver against PostgreSQL

### Database
- Schema lives in `src/lib/server/db/schema.ts`
- DB client exported from `src/lib/server/db/index.ts` as `db`
- Requires `DATABASE_URL` env var (see `.env.example`): `postgres://user:password@host:port/db-name`
- Use `db:push` during development for fast iteration; use `db:generate` + `db:migrate` for production migrations

### Key conventions
- All server-only code (DB access, etc.) goes under `src/lib/server/` — SvelteKit enforces this boundary
- Svelte runes mode is on by default for the whole project (`$props()`, `$state()`, `$derived()`, etc.)
- Global styles imported in `src/routes/+layout.svelte` via `layout.css`

---

You are able to use the Svelte MCP server, where you have access to comprehensive Svelte 5 and SvelteKit documentation. Here's how to use the available tools effectively:

## Available MCP Tools:

### 1. list-sections

Use this FIRST to discover all available documentation sections. Returns a structured list with titles, use_cases, and paths.
When asked about Svelte or SvelteKit topics, ALWAYS use this tool at the start of the chat to find relevant sections.

### 2. get-documentation

Retrieves full documentation content for specific sections. Accepts single or multiple sections.
After calling the list-sections tool, you MUST analyze the returned documentation sections (especially the use_cases field) and then use the get-documentation tool to fetch ALL documentation sections that are relevant for the user's task.

### 3. svelte-autofixer

Analyzes Svelte code and returns issues and suggestions.
You MUST use this tool whenever writing Svelte code before sending it to the user. Keep calling it until no issues or suggestions are returned.

### 4. playground-link

Generates a Svelte Playground link with the provided code.
After completing the code, ask the user if they want a playground link. Only call this tool after user confirmation and NEVER if code was written to files in their project.
