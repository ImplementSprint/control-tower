# Deploy to Vercel

This application is a single Next.js fullstack app. Deploy it directly to Vercel.

## 1) Import the Repository

1. Go to Vercel and create a new project.
2. Import this repository.
3. Keep Root Directory as repository root.
4. Framework preset should auto-detect as Next.js.

## 2) Configure Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY

Notes:

- NEXT_PUBLIC_* variables are exposed to browser code.
- SUPABASE_SERVICE_ROLE_KEY is server-only and must never be exposed to client components.

## 3) Build Settings

- Install Command: npm install
- Build Command: npm run build
- Output: Next.js default

## 4) Database Initialization

Before first production use, run SQL from supabase/schema.sql in Supabase SQL editor.

## 5) Verify Deployment

After deploy:

1. Open the root page.
2. Create a deployment record from the form.
3. Confirm record appears in Recent Deployments.

If data does not load, verify Supabase environment variables and schema setup.
