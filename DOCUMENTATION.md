# Qatar Food Safety Dashboard — Documentation

This document describes the **Qatar Food Safety Dashboard**: purpose, architecture, security model, database objects used by the app, and how to run and deploy it.

---

## 1. Project overview

The Qatar Food Safety Dashboard is a **single-page web application** for monitoring food safety inspections across Qatar. It provides:

- An **analytics dashboard** (filters by calendar year and municipality area, KPIs, charts, operational status follow-up, reinspection-oriented views).
- An **establishments directory** with search, sorting, export, and detail workflows (inspection history, manual inspection entry, edits where permitted).
- **Administration** for reference data (areas, ratings, years, operational statuses, inspectors, calendar events) and **dashboard user accounts** linked to Supabase Auth.
- **Excel-based data import** (strict validation and merge phases) for users granted import access.
- **Bilingual UI** (Arabic / English) via i18next and a **Progressive Web App (PWA)** shell for installability and offline-friendly asset caching.

Operational inspection data is loaded from **Supabase (PostgreSQL)** using the Supabase JavaScript client (PostgREST). The repository also ships **deterministic mock data** for UI development and **localStorage** persistence for imported spreadsheet snapshots used by some legacy paths.

---

## 2. Tech stack

| Layer | Technology |
|--------|-------------|
| UI | **React 19**, **TypeScript** |
| Build / dev server | **Vite 8** |
| Routing | **React Router 7** |
| Styling | **Tailwind CSS 4** (`@tailwindcss/vite`) |
| Components | **Radix UI** primitives, **shadcn-style** UI patterns |
| Charts | **Recharts** |
| Motion | **Framer Motion** |
| Forms / validation | **React Hook Form**, **Zod**, **@hookform/resolvers** |
| Backend / data | **Supabase** (`@supabase/supabase-js`) — Auth + Postgres + Row Level Security |
| Spreadsheets | **SheetJS (xlsx)**, **ExcelJS** |
| i18n | **i18next**, **react-i18next** |
| PWA | **vite-plugin-pwa** (Workbox), manifest from `public/manifest.json` |

---

## 3. Features implemented

### 3.1 Authentication and session

- Email/password sign-in via **Supabase Auth** (`signInWithPassword`).
- Password reset email flow (`resetPasswordForEmail`) with redirect back to `/login`.
- After login, the app loads the matching row from **`public.users`** (role, areas, `can_import`, `is_active`, `must_change_password`, display name).
- **Inactive** accounts (`is_active = false`) are signed out automatically.
- **Mandatory password change**: when `must_change_password` is true, the user is guided through a forced password update before using the app.

### 3.2 Dashboard (`/dashboard`)

- Year filter aligned with **active `years`** rows in Supabase.
- Area filter: **admins** see all areas; **supervisors and inspectors** see only areas assigned in **`user_areas`** (and legacy `area_ids` synced into that junction).
- Remote aggregation of establishments, inspections (including null-date rows where applicable), operational status per year via **`establishment_status_history`**, and reinspection hints from **`ratings`** + **`reinspection_periods`**.
- Dashboard widgets: welcome card, stats, ratings distribution and trend charts, establishments table, events bar, announcements carousel (static mock items in code unless replaced).

### 3.3 Establishments (`/establishments`)

- Directory backed by the **`establishments_with_latest_inspection`** view (when available) with hydration fallbacks for operational status names.
- Search, filters, sorting, table export utilities.
- Establishment detail sheet: inspection list, add/delete inspections (subject to permissions), establishment edit/delete (subject to permissions).
- PDF/image-oriented helpers (e.g. html2canvas, jsPDF) where printing or export is implemented.

### 3.4 Data import (`/import`)

- Guarded by **`ImportRoute`**: only users with **`canImport`** (from `public.users.can_import`) may access; admins do not automatically import unless `can_import` is true (see [§8](#8-user-roles-and-permissions)).
- Multi-phase Excel import: validation, duplicate detection, and Supabase writes via **`saveImportedDataset`** (batch inserts/updates/deletes).

### 3.5 Admin panel (`/admin`)

- Restricted to **`role === admin`** (`AdminRoute`).
- CRUD for: **areas**, **ratings**, **reinspection_periods**, **years**, **operational_statuses**, **inspectors**, **events**.
- User management: **`public.users`** and **`user_areas`**, optional provisioning against **Supabase Auth** when a **service-role** client is configured in the build (see [§5](#5-security-measures-rls-and-policies) and [§6](#6-deployment-vercel)).

### 3.6 Settings (`/settings`)

- Profile-oriented settings (e.g. password change dialogs) consistent with auth flows.

### 3.7 Progressive Web App

- Service worker registration (**auto-update**), precaching of static assets, **network-first** caching for app chunks and Google Fonts; **`version.json`** excluded from precaching so version probes stay fresh.

### 3.8 Developer aids

- Optional **localStorage overrides** for role and area IDs (`qfsd-dev-role`, `qfsd-dev-area-ids`) used when profile metadata is incomplete — intended for development only.

---

## 4. Application routes

| Path | Guard | Purpose |
|------|--------|---------|
| `/login` | Public | Sign-in, reset password entry, forced password change modal |
| `/dashboard` | Authenticated | Main dashboard |
| `/establishments` | Authenticated | Establishments directory |
| `/import` | Authenticated + `canImport` | Spreadsheet import |
| `/admin` | Authenticated + admin role | Admin CRUD |
| `/settings` | Authenticated | User settings |
| `/`, `/reports`, `/compliance`, `/data-import` | Redirects | Navigation aliases |

---

## 5. Security measures (RLS and policies)

### 5.1 General principles

- The browser uses the **anon key** with end-user JWTs. **Row Level Security (RLS)** on Postgres tables defines what authenticated users can read or write.
- **Never expose the Supabase service role key** in a public production frontend bundle. The codebase supports `VITE_SUPABASE_SERVICE_ROLE_KEY` only for **internal/admin tooling**; production should move Auth admin operations to a **trusted backend**.

### 5.2 `public.users`

Defined and evolved in migrations (see `supabase/migrations/`):

- **SELECT**: `users_select_own` — users read their own row (`auth_user_id = auth.uid()`).
- **SELECT**: `users_select_if_admin` — active admins may read all profiles.
- **INSERT / UPDATE / DELETE**: `users_insert_admin`, `users_update_admin`, `users_delete_admin` — only when **`public.is_dashboard_admin()`** returns true.

**`is_dashboard_admin()`** is a **`SECURITY DEFINER`** SQL function (restricted `EXECUTE` to `authenticated`) that checks for an active `public.users` row with `role = 'admin'`, avoiding recursive RLS evaluation.

### 5.3 `public.user_areas`

- **SELECT**: own rows (via join to `users.auth_user_id`) or **admin** read-all pattern (mirrors `users` admin check).
- **INSERT / DELETE**: admin-only policies paired with `is_dashboard_admin()`.

### 5.4 `public.events`

- RLS enabled with a **permissive “Allow all operations”** policy for roles granted on the table (including `anon`/`authenticated` per migration). **Tighten this for production** if events should not be world-readable or anonymously writable.

### 5.5 Other tables (establishments, inspections, reference data)

This repository **does not contain** the full baseline migrations for every dashboard table. In production you must ensure:

- RLS is **enabled** (and policies defined) for **`establishments`**, **`inspections`**, **`establishment_status_history`**, **`areas`**, **`years`**, **`ratings`**, **`reinspection_periods`**, **`operational_statuses`**, **`inspectors`**, and any **`establishments_with_latest_inspection`** view definitions exposed to PostgREST.
- Grants to `anon` / `authenticated` match your threat model.

### 5.6 Audit helper script

`supabase/scripts/rls_security_audit.sql` contains SQL snippets to list RLS status, policies, and privileges — run in the Supabase SQL editor as a privileged role.

---

## 6. Deployment (Vercel)

The repo includes **`vercel.json`** with a **SPA fallback**:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

This ensures client-side routes (`/dashboard`, `/establishments`, etc.) resolve correctly on refresh.

### Recommended Vercel setup

1. Connect the Git repository to Vercel.
2. Framework preset: **Vite** (or static build with `npm run build`, output directory **`dist`**).
3. Set **environment variables** in Vercel (see [§7](#7-setup-instructions)):
   - Required: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - Optional / discouraged on public sites: `VITE_SUPABASE_SERVICE_ROLE_KEY` (prefer server-side Auth admin API instead).

4. Configure **Supabase Auth** redirect URLs to include your production origin (for password reset and any OAuth if enabled later).

---

## 7. Setup instructions

### 7.1 Prerequisites

- **Node.js** (version compatible with Vite 8 / React 19 — use current LTS).
- A **Supabase project** with Postgres schema and RLS aligned with this app (apply migrations from `supabase/migrations/` **plus** your baseline schema for establishments/inspections).

### 7.2 Clone and install

```bash
git clone <repository-url>
cd qatar-food-safety-dashboard
npm install
```

### 7.3 Environment variables

Create a `.env` (or `.env.local`) in the project root:

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anonymous (browser) key |
| `VITE_SUPABASE_SERVICE_ROLE_KEY` | Optional | Service role — **Auth Admin API** from the browser for user provisioning in admin panel; avoid in public production |

The app throws at startup if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing (`src/lib/supabase.ts`).

### 7.4 Database migrations

From the Supabase CLI (or SQL editor), apply migrations in **`supabase/migrations/`** in timestamp order. They cover:

- `events` table + initial open RLS policy
- `users` profile table linked to `auth.users`
- Pending users, `user_areas`, optional email/name/password hash columns
- Admin mutation policies and `is_dashboard_admin()`
- Inspection FK cascade, ratings label tweak, events area columns, role rename to `supervisor`

You must still provide (elsewhere) base tables: **`areas`**, **`establishments`**, **`inspections`**, **`establishment_status_history`**, **`years`**, **`ratings`**, **`reinspection_periods`**, **`operational_statuses`**, **`inspectors`**, and the **`establishments_with_latest_inspection`** view if used.

### 7.5 Run locally

```bash
npm run dev
```

Build for production:

```bash
npm run build
npm run preview   # optional local preview of dist/
```

### 7.6 Optional assets

- `npm run prepare:logo` — logo preparation script (see `package.json`).
- PWA icons live under `public/`; package notes warn against blindly regenerating them.

---

## 8. User roles and permissions

### 8.1 Roles in `public.users.role`

| Role | Notes |
|------|--------|
| **`admin`** | Full admin panel access; sees **all** areas in filters; user management. |
| **`supervisor`** | Formerly `inspector_manager` in older migrations — renamed in SQL. |
| **`inspector`** | Field-oriented role with scoped areas. |

The UI **`SessionRole`** type also includes **`viewer`** for JWT/metadata fallbacks; **`public.users`** rows created by migrations default non-admin accounts toward **`inspector`**. Effective role for logged-in users prefers the **`users`** table after profile load (`AuthContext`).

### 8.2 Area scope

- **Admins**: all areas from `areas` table.
- **Supervisors / inspectors**: intersection of **`user_areas`** (and legacy `area_ids` backfill) with known areas — see `useFilterAreas`.

### 8.3 Feature gates (application layer)

| Capability | Rule (summary) |
|------------|----------------|
| **Admin panel** | `effectiveRole === "admin"` |
| **Import page** | `public.users.can_import === true` (not inferred from role alone) |
| **Establishment create/update/delete** | Roles: admin, supervisor, inspector (`canEditEstablishment`) |
| **Inspection edit/delete for a venue** | Same area rules as establishment area access: admin all; viewer none; supervisor/inspector only if establishment `area_id` is in their assigned list (`canEditInspection` / `canDeleteInspection`) |

RLS on the database must **mirror** these rules for any mutation paths exposed to the client.

### 8.4 Auth provisioning

Admin flows may create/update/delete **`auth.users`** when **`getAdminServiceClient()`** resolves (service role in env). Without it, the UI surfaces errors directing operators to configure the key or a backend — see `adminUsersCrud.ts`.

---

## 9. Database schema (application-facing)

The following reflects **tables and views the TypeScript code reads or writes**. Column lists combine **repo migrations** and **application usage**; columns marked “app expects” may need to be added in your baseline schema if missing.

### 9.1 `public.users` (dashboard profile)

- **Keys**: `id` (PK), `auth_user_id` (FK → `auth.users`, nullable for pending invites)
- **Auth / profile**: `email`, `name`, `password_hash` (optional provisioning), `full_name` (legacy migration field), `must_change_password` (boolean — used by app; ensure column exists in your DB)
- **Authorization**: `role` (`admin` \| `supervisor` \| `inspector`), `area_ids` (legacy `text[]`, backfilled to `user_areas`), `can_import`, `is_active`
- **Audit**: `created_at`, `updated_at`

### 9.2 `public.user_areas`

- **PK**: (`user_id`, `area_id`)
- **FK**: `user_id` → `users.id`; optional `area_id` → `areas.id` when types align

### 9.3 `public.events`

- Localized titles/descriptions, optional free-text area names, `event_date`, `year`, `icon`, `is_active`, timestamps

### 9.4 Reference tables

- **`areas`**: at least `id`, `name_ar`, `name_en` (and fields edited in admin panels)
- **`years`**: `id`, `year`, `is_active`
- **`ratings`**: `id`, `name_ar`, `name_en`, `color`, `order`, optional reinspection metadata
- **`reinspection_periods`**: `rating_id`, `days`
- **`operational_statuses`**: `id`, `name_ar`, `name_en`, `order`
- **`inspectors`**: `id`, `name_ar`, `name_en`, `is_active`

### 9.5 Core operational tables

- **`establishments`**: includes `area_id` (FK-style reference to `areas`), display `name`, extended EMS columns used by import (e.g. English name, outlets, contacts) as present in your schema
- **`inspections`**: `establishment_id`, `inspection_date`, `rating_id`, `inspector_id`, `reference_number`, `notes`, `heatmap_url`, `year_id`, `task_type`; FK to establishments with **ON DELETE CASCADE** (migration in repo)
- **`establishment_status_history`**: ties `establishment_id`, `year_id`, `operational_status_id` (and related fields your schema defines)

### 9.6 Views

- **`establishments_with_latest_inspection`**: used for filtered directory queries; exposes columns such as latest inspection date, rating names/ids, `operational_status_id`, `inspection_count` (or equivalents — mapper accepts several naming variants)

---

## 10. API endpoints

There is **no custom REST server** in this repository. All remote access goes through **Supabase**:

| Surface | Base URL pattern | Auth |
|---------|------------------|------|
| **PostgREST** | `{VITE_SUPABASE_URL}/rest/v1/{table_or_view}` | `apikey: <anon key>`, `Authorization: Bearer <user JWT>` |
| **Auth** | Supabase Auth endpoints (handled by `@supabase/supabase-js`) | Managed by client library |

### 10.1 Tables and views touched by the client

Reads/writes use `.from("<name>").select|insert|update|delete` on objects including:

`users`, `user_areas`, `areas`, `years`, `ratings`, `reinspection_periods`, `operational_statuses`, `inspectors`, `events`, `establishments`, `establishment_status_history`, `inspections`, `establishments_with_latest_inspection`.

### 10.2 RPCs

The codebase does **not** call `.rpc()` for server-side functions; privileged logic relies on **RLS-approved SQL** and the optional **service-role** client for Auth admin operations.

---

## 11. Related files

| Topic | Location |
|-------|-----------|
| Routes | `src/App.tsx` |
| Auth context | `src/auth/AuthContext.tsx`, `src/auth/session.ts` |
| Permission helpers | `src/lib/permissions/*.ts` |
| Remote data mapping | `src/lib/supabase/remoteDataset.ts` |
| Import persistence | `src/lib/supabase/saveImportedDataset.ts` |
| Admin user CRUD | `src/lib/supabase/adminUsersCrud.ts` |
| SQL migrations | `supabase/migrations/` |
| RLS audit queries | `supabase/scripts/rls_security_audit.sql` |
| Vercel SPA rewrite | `vercel.json` |

---

## 12. Maintenance notes

- Keep **Supabase RLS** policies in sync with UI permission helpers whenever you add mutations.
- Replace permissive **`events`** policies if anonymous access is unacceptable.
- Prefer a **small backend** for user provisioning instead of embedding the service role in `VITE_*` for public deployments.

---

*Generated from the repository state; align deployment-specific values (URLs, keys, exact DB columns) with your Supabase project.*
