import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// The rewrites vercel.json applies in production, applied to the dev server
// too. Vite serves files, so without this `npm run dev` answers /app.html and
// nothing else -- a boutique's own address, /saralaboutique, 404s locally
// while working once deployed, which is the worst way to find out.
//
// Kept deliberately narrow: only a path with ONE segment and no dot in it, and
// only when it is not one of the reserved names. Anything else falls through
// to Vite, so /assets/*, /favicon.ico and a genuinely wrong path behave here
// the way they do on Vercel, where the filesystem is consulted first.
const RESERVED_DEV_PATHS = new Set([
  'api', 'admin', 'track', 'media', 'static', 'assets',
  'blog', 'demo', 'faq', 'for-customers', 'lifecycle', 'modules',
  'what-it-is', 'your-floor', 'node_modules', 'src', 'public',
])

function portalDevRewrites() {
  return {
    name: 'portal-dev-rewrites',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query = ''] = (req.url || '/').split('?')
        const search = query ? `?${query}` : ''
        const segments = pathname.split('/').filter(Boolean)
        if (!segments.length || segments[0].startsWith('@')) return next()

        if (segments[0] === 'app') {
          req.url = `/app.html${search}`
          return next()
        }
        if (segments[0] === 'superadmin') {
          req.url = `/superadmin.html${search}`
          return next()
        }

        if (segments.length !== 1) return next()
        let only
        try {
          only = decodeURIComponent(segments[0]).toLowerCase()
        } catch {
          return next()
        }
        if (only.includes('.') || RESERVED_DEV_PATHS.has(only)) return next()
        if (!/^[a-z0-9]+$/.test(only)) return next()
        req.url = `/app.html${search}`
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), portalDevRewrites()],
  build: {
    rollupOptions: {
      // Vite builds the React workspace only. The marketing site is plain
      // static HTML assembled by build-site.mjs after this runs -- it has no
      // bundle, no framework and no client-side routing on purpose, because a
      // crawler that does not execute JavaScript has to be able to read it.
      // Two entries, two bundles, on purpose. The platform console shares no
      // component with the boutique workspace and is opened by a handful of
      // people; folding it into app.html would put it in the download every
      // boutique makes. They share React and lucide-react, which the chunking
      // below already splits out, so the second entry costs its own code and
      // nothing else.
      input: {
        app: fileURLToPath(new URL('./app.html', import.meta.url)),
        superadmin: fileURLToPath(new URL('./superadmin.html', import.meta.url)),
      },
      output: {
        // Everything used to land in one ~594KB file, so shipping a one-line
        // change to the app invalidated React and the icon set along with it,
        // and every returning user re-downloaded the lot. These dependencies
        // change only when we upgrade them, so giving them their own chunks
        // lets the browser keep them cached across deploys.
        // Rolldown (Vite 8) only accepts the function form here, not an object.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('lucide-react')) return 'icons'
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react'
        },
      },
    },
  },
})
