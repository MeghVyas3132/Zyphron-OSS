# Zyphron Frontend

Next.js dashboard application for Zyphron.

## Scope

This app provides auth flows, project/deployment UX, stack deployment pages, admin/team/audit views, and operational pages for observability and advanced controls.

## Tech Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS + shadcn/ui style component patterns
- TanStack Query for API state
- Zustand for local state where needed

## App Structure

```text
frontend/src/
  app/
    (auth)/
      login/
      register/
      forgot-password/
      callback/
    (dashboard)/
      dashboard/
      projects/
      admin/
      teams/
      audit/
      observability/
      strategies/
      chaos/
      edge/
      self-deploy/
      cloud/
  components/
  hooks/
  lib/
  styles/
```

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run type-check
```

## Environment Variables

Common frontend env vars:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_GRAFANA_URL`
- `NEXT_PUBLIC_GITHUB_CLIENT_ID` (if using GitHub OAuth button flows)

## Local Run

With compose (recommended):

```bash
docker compose -f docker-compose.dev.yml up --build
```

Standalone frontend:

```bash
cd frontend
npm install
npm run dev
```

Default local URL is `http://localhost:3000` for standalone mode and `http://localhost:3004` via compose.

## Notes

- Frontend behavior is coupled to backend route availability.
- Root `README.md` is the canonical platform-level documentation.

