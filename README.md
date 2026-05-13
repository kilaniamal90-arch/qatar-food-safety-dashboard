# Qatar Food Safety Dashboard

Web dashboard for Qatar food safety inspections: establishments register, inspection analytics, bilingual UI (Arabic / English), Excel import, and Supabase-backed administration.

## Tech stack

React, TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL + Auth + RLS), PWA (vite-plugin-pwa).

## Quick start

```bash
npm install
```

Create `.env` in the project root:

```env
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Optional (development / internal admin only — **do not ship service role to public production sites**):

```env
VITE_SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

```bash
npm run dev
```

Production build:

```bash
npm run build
```

## Deployment

The project includes `vercel.json` with SPA rewrites so client routes work on refresh. Connect the repo to [Vercel](https://vercel.com), set the same `VITE_*` variables in the project settings, and use output directory **`dist`** after `npm run build`.

## Documentation

**Full documentation** (features, security / RLS, schema overview, API usage, roles): see **[DOCUMENTATION.md](./DOCUMENTATION.md)**.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Typecheck + production bundle |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm run prepare:logo` | Logo preparation utility |

## License

Private project (`"private": true` in `package.json`).
