/**
 * The Terms & Conditions and Privacy Policy as pages of their own, at
 * /termcondition and /privacypolicy.
 *
 * The text is the one the sign-up form's popup shows (src/constants/legal.js),
 * read from there rather than copied, so the page a boutique can link to and
 * the text its owner ticked "I agree" to cannot drift apart. The same rules
 * apply: a blank line starts a paragraph, and a one-line paragraph that starts
 * with a number ("3. Your account") is a section heading.
 *
 * Both paths are reserved as boutique slugs: tenants/slugs.py RESERVED and
 * RESERVED_DEV_PATHS in vite.config.js.
 */
import { TERMS_AND_CONDITIONS, PRIVACY_POLICY } from '../src/constants/legal.js'

const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// An email address in the text becomes a link, as it would in any letter.
const linkEmails = (s) =>
  s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (m) => `<a href="mailto:${m}">${m}</a>`)

function documentBody(text) {
  const paras = text.trim().split(/\n\s*\n/)
  // "Last updated: October 2026" opens each document; it sits in the hero.
  const updated = /^Last updated:/i.test(paras[0]) ? paras.shift() : ''
  const html = paras
    .map((para) => {
      const inner = linkEmails(escape(para))
      if (/^\d+\.\s/.test(para) && !para.includes('\n')) return `    <h2>${inner}</h2>`
      return `    <p class="lede">${inner.replace(/\n/g, '<br />')}</p>`
    })
    .join('\n')
  return { updated, html }
}

function legalPage({ slug, title, description, intro, text }) {
  const { updated, html } = documentBody(text)
  return {
    file: `${slug} (src/constants/legal.js)`,
    meta: { slug, nav: '', title: `${title} — Scaleezy Boutique`, description },
    body: `<header class="page-hero">
  <div class="wrap">
    <p class="crumbs"><a href="/">Home</a> · ${escape(title)}</p>
    <span class="eyebrow">Legal</span>
    <h1>${escape(title)}</h1>
    <p>${intro}${updated ? ` ${escape(updated)}.` : ''}</p>
  </div>
</header>

<section class="legal-doc">
  <div class="wrap" style="max-width:780px">
${html}
  </div>
</section>`,
  }
}

export const legalPages = () => [
  legalPage({
    slug: 'termcondition',
    title: 'Terms & Conditions',
    description:
      'The terms a boutique accepts when it signs up for Scaleezy Boutique: the account, plans, your data and your customers\' data, fair use, availability and how either side can end the arrangement.',
    intro: 'The terms a boutique accepts when it signs up for Scaleezy Boutique, and every time it uses it.',
    text: TERMS_AND_CONDITIONS,
  }),
  legalPage({
    slug: 'privacypolicy',
    title: 'Privacy Policy',
    description:
      'What personal information Scaleezy Boutique handles for boutiques, their staff and their customers, why, who it is shared with, how it is protected and the rights people have over it.',
    intro: 'What personal information Scaleezy Boutique handles, why, and how it is protected.',
    text: PRIVACY_POLICY,
  }),
]
