# Obiba web

The Obiba wallet frontend, a Next.js static export hosted on GitHub Pages at https://obiba.kwespay.me.

```bash
pnpm install
pnpm dev        # needs .env.local; see .env.example
pnpm test
pnpm build      # writes the static site to out/
```

Pushes to `main` build, test and deploy through `.github/workflows/deploy.yml`. Client configuration lives in `.env.production`; all of it is public.

## Static hosting

- **Record pages take their ID as a query parameter**, for example `/activity/detail?id=...`. Build links with `src/lib/routes.ts`.
- **Path-style links keep working.** The API issues `/pay/<id>` payment links; `src/app/not-found.tsx` forwards those from the `404.html` page.
- **The CSP is a per-page meta tag.** `scripts/finalize-static.mjs` pins each page's inline scripts by hash after the build.

GitHub Pages cannot send response headers, so this site has no `frame-ancestors`, `X-Frame-Options`, HSTS or `Permissions-Policy` from the origin. Set them at the edge before handling real funds.
