"""The boutique's own portal path: /saralaboutique rather than /app.

A slug is an ALIAS, not an authorisation input. Nothing here selects a schema:
tenant resolution stays with the token (crm_api.auth_views.LoginView) and the
X-Tenant-ID header (tenants.middleware), both of which the browser cannot
choose for itself. See crm_api.auth_views.BoutiqueBySlugView.
"""

import re

from django.utils.text import slugify

#: As long as schema_name, which is the other unique identifier on the row.
MAX_LENGTH = 63

#: Paths the portal origin already answers for. A boutique slugged to one of
#: these is unreachable rather than broken -- Vercel resolves a static file
#: before it applies the catch-all rewrite, so the boutique would silently get
#: the marketing page instead of its workspace.
RESERVED = frozenset({
    # The two Vite entries and their rewrites (frontend/vercel.json).
    'app', 'superadmin',
    # Django's own routes (boutique_crm/urls.py).
    'api', 'admin', 'track', 'demo-request', 'media', 'static',
    # The marketing site's pages, which frontend/build-site.mjs emits as
    # <slug>/index.html, plus what vite build copies in beside them.
    'blog', 'demo', 'faq', 'for-customers', 'lifecycle', 'modules',
    'what-it-is', 'your-floor',
    'assets', 'garment-base', 'robots.txt', 'sitemap.xml', 'styles.css',
    'favicon.ico', 'apple-touch-icon.png', 'icon-512.png', 'icons.svg',
    'og.png',
    # Not mounted today. Held back because a boutique reachable at one of them
    # would read as a platform page rather than as its own workspace.
    'auth', 'login', 'logout', 'signup', 'settings', 'support', 'help',
})


def normalise(name):
    """'Sarala Boutique' -> 'saralaboutique'.

    slugify first so an accent transliterates rather than vanishes -- 'Café'
    becomes 'cafe', where stripping non-ASCII outright leaves 'caf'. Its
    hyphens then go too, because the portal URL is one unbroken word.
    """
    return re.sub(r'[^a-z0-9]', '', slugify(name or '', allow_unicode=False))[:MAX_LENGTH]


def make_shop_slug(name, taken=(), fallback=''):
    """A slug for `name` that is neither reserved nor already in `taken`.

    Deterministic: the same name against the same taken set always gives the
    same answer, so the backfill migration can be re-run without renaming
    anybody. A name that normalises to nothing -- punctuation only, or a script
    slugify cannot transliterate -- falls back to `fallback` (the schema name)
    and then to a literal, because an empty slug would mean the boutique's URL
    is the site root.
    """
    base = normalise(name) or normalise(fallback) or 'boutique'
    taken = set(taken)

    if base not in RESERVED and base not in taken:
        return base

    suffix = 2
    while True:
        candidate = f'{base[:MAX_LENGTH - len(str(suffix))]}{suffix}'
        if candidate not in RESERVED and candidate not in taken:
            return candidate
        suffix += 1
