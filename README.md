# Quizer

A minimalist, mobile-first quiz/practice web app built with SvelteKit, Drizzle ORM, and PostgreSQL. No login required for end users.

## Features

- **Luyện Tập Nhanh** — 50 random questions with weighted selection (prioritises unseen questions)
- **Ôn Tập Toàn Diện** — all questions in ID order, unseen-first, with progress tracking and session resume
- **Ôn Lại Câu Cũ** — revisit all previously seen questions in ID order
- **Ngân hàng câu hỏi** — browse the full question bank with live search, select specific questions, and start a custom session
- Smooth two-phase answer reveal (300 ms delay → green/red highlight + explanation)
- Session summary panel with expandable explanations and ✓/✗ per question
- "Luyện tập lại câu sai" — one-tap retry of wrong answers after a session
- Admin portal at `/admin` (password-protected, hidden URL) with XLSX upload and inline question editing

## Question schema

Questions are stored in PostgreSQL with these columns:

| Column | Type | Notes |
|---|---|---|
| id | serial PK | auto-assigned |
| question | text | question text |
| ans1 | text | first answer (required) |
| ans2 | text | second answer (required) |
| ans3 | text \| null | third answer (optional) |
| ans4 | text \| null | fourth answer (optional) |
| correct_ans_index | integer | 1-based index of correct answer |
| reason | text | explanation shown after answering |

Supports 2-answer (true/false), 3-answer, and 4-answer questions.

## XLSX upload format

The first row is a header and is skipped. Data rows use these columns by index:

| Column | Content |
|---|---|
| A | Question text |
| B | Answer 1 |
| C | Answer 2 |
| D | Answer 3 (optional) |
| E | Answer 4 (optional) |
| F | Correct answer index (1–4) |
| G | Explanation |

## Setup

### 1. Environment

```sh
cp .env.example .env
# Edit .env — set DATABASE_URL and ADMIN_PASSWORD
```

`.env.example`:
```
DATABASE_URL=postgres://user:password@host:port/db-name
ADMIN_PASSWORD=changeme
```

### 2. Install dependencies

```sh
npm install
```

### 3. Push schema to database

```sh
npm run db:push
```

### 4. Start dev server

```sh
npm run dev
```

## Commands

```sh
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # Type-check with svelte-check

npm run db:push      # Push schema changes to DB (no migration file)
npm run db:generate  # Generate migration files from schema
npm run db:migrate   # Run pending migrations
npm run db:studio    # Open Drizzle Studio (DB GUI)
```

## Deployment

Install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment, then:

```sh
npm run build
```

The admin cookie is `httpOnly`, `sameSite: strict`, and expires after 7 days.
