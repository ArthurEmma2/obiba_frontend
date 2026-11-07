# Obiba web

The Obiba wallet frontend, a Next.js static export hosted on GitHub Pages at https://app.obibajk.com.

```bash
pnpm install
pnpm dev        # needs .env.local; see .env.example
pnpm test
pnpm build      # writes the static site to out/
```

Pushes to `main` build, test and deploy through `.github/workflows/deploy.yml`. Client configuration lives in `.env.production`; all of it is public.

## Static hosting

- Pages export as directories (`/sign-in/index.html`) so direct links and refreshes work on GitHub Pages. Production uses the custom-domain root; keep `NEXT_PUBLIC_BASE_PATH` and `NEXT_PUBLIC_UI_PREVIEW` unset in `.env.production`.
- **Record pages take their ID as a query parameter**, for example `/activity/detail?id=...`. Build links with `src/lib/routes.ts`.
- **Path-style links keep working.** The API issues `/pay/<id>` payment links; `src/app/not-found.tsx` forwards those from the `404.html` page.
- **The CSP is a per-page meta tag.** `scripts/finalize-static.mjs` pins each page's inline scripts by hash after the build.

GitHub Pages cannot send response headers, so this site has no `frame-ancestors`, `X-Frame-Options`, HSTS or `Permissions-Policy` from the origin. Set them at the edge before handling real funds.
