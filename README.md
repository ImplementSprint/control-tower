# Control Tower

Fullstack Next.js application designed for Vercel deployment, using shadcn/ui for UI and Supabase for database storage.

## Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui components
- Supabase (Postgres)

## Features

- Dashboard metrics for deployments
- Create deployment records via API route
- Update deployment status via API route
- Supabase-backed persistence with typed validation

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env.local
```

3. Set values in .env.local:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

4. Create the database table in Supabase SQL editor using:

- supabase/schema.sql

5. Start development server:

```bash
npm run dev
```

Open http://localhost:3000.

## API Endpoints

- GET /api/deployments
- POST /api/deployments
- PATCH /api/deployments/:id

## Vercel Deployment

See DEPLOY_VERCEL.md for a production deployment checklist.
