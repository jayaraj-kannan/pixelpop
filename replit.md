# PixelPop

PixelPop turns photos into pixel-art PNGs and looping GIFs, then shares them through the device's native share sheet.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Mobile app: `artifacts/pixel-art-maker`
- Editor: `artifacts/pixel-art-maker/app/index.tsx`
- Image conversion and binary export: `artifacts/pixel-art-maker/src/lib/pixel-art.ts`
- Mobile theme: `artifacts/pixel-art-maker/constants/colors.ts`

## Architecture decisions

- Normal pixel editing and GIF animation stay on-device. The user approved sending photos to a processing service specifically for automatic AI background removal. Keep removal opt-in, explain that it uploads the selected photo, and do not upload photos during normal editing.
- Export PNG at up to 1024 pixels on the longest side and GIF at up to 512 pixels to keep sharing practical.
- GIFs offer color pulse, bounce, sway, zoom, and wobble, with adjustable speed and strength. These are local full-photo transforms, not AI-generated subject motion. Nearest-neighbor sampling preserves pixel edges; motion gently crops to keep the canvas filled.
- Use native sharing for installed compatible apps. Do not promise that every app will accept every format.

## Product

- Choose a photo from the native library or try a bundled sample.
- Adjust the pixel block size and preview the result.
- Export PNG or animated GIF and open the device share sheet.
- Keep the latest 12 native exports locally for sharing again.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
