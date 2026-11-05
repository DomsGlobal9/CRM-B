#!/usr/bin/env node
/**
 * Checks src/color-tokens.css: every family has all ten shades in every theme,
 * each scale runs in order, and every text-on-background pair the system allows
 * reaches WCAG AA (4.5:1). Fails the command if anything does not.
 *
 *   npm run check:colors          the verdict
 *   npm run check:colors -- --json   the measurements, for tooling
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = resolve(dirname(fileURLToPath(import.meta.url)), '../src/color-tokens.css');
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const FAMILIES = ['primary', 'neutral', 'success', 'warning', 'danger', 'info', 'accent'];
const AA = 4.5;

const SELECTORS = {
  scaleezy: ':root',
  'scaleezy-dark': 'html[data-theme="scaleezy-dark"]',
  atelier: 'html[data-theme="atelier"]',
  'atelier-dark': 'html[data-theme="atelier-dark"]',
};

/** Where each theme's text sits: the steps its page, cards, rows and wells use. */
const GROUNDS = {
  scaleezy: { card: '--white', page: 'neutral-100', row: 'neutral-50', well: 'neutral-200' },
  'scaleezy-dark': { card: 'neutral-100', page: 'neutral-50', row: 'neutral-200', well: 'neutral-300' },
  atelier: { card: '--white', page: 'neutral-100', row: 'neutral-50', well: 'neutral-200' },
  'atelier-dark': { card: 'neutral-100', page: 'neutral-50', row: 'neutral-200', well: 'neutral-300' },
};

/** The text colour on each brand fill, and the link colour on each theme's grounds. */
const BRAND = {
  scaleezy: { on: [['--ink', 'primary-50'], ['--ink', 'primary-100'], ['--ink', 'primary-200'], ['--ink', 'primary-300'],
    ['--ink', 'primary-400'], ['--ink', 'primary-500'], ['--ink', 'primary-600'], ['--ink', 'primary-700'],
    ['--white', 'primary-800'], ['--white', 'primary-900']], link: 'primary-800', linkOn: ['primary-100'] },
  'scaleezy-dark': { on: [['--ink', 'primary-500'], ['--ink', 'primary-600'], ['--ink', 'primary-700'], ['--ink', 'primary-800'],
    ['neutral-900', 'primary-100']], link: 'primary-700', linkOn: ['primary-100'] },
  atelier: { on: [['--white', 'primary-400'], ['--white', 'primary-500'], ['--white', 'primary-600'],
    ['neutral-900', 'primary-50'], ['neutral-900', 'primary-100'], ['neutral-900', 'primary-200']],
  link: 'accent-700', linkOn: ['accent-50'] },
  'atelier-dark': { on: [['neutral-50', 'primary-500'], ['neutral-50', 'primary-600'], ['neutral-900', 'primary-100']],
    link: 'accent-700', linkOn: ['accent-100'] },
};

const INK = '#020202'; // --primary-foreground, the near-black on lime

const channel = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

function parse() {
  const css = readFileSync(CSS, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const themes = {};
  for (const [name, selector] of Object.entries(SELECTORS)) {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`No block for ${selector}`);
    const body = css.slice(start, css.indexOf('}', start));
    themes[name] = Object.fromEntries(
      [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
    );
  }
  return themes;
}

const problems = [];
const pairs = [];
const themes = parse();
const white = themes.scaleezy.white;

const lookup = (theme, name) => {
  if (name === '--white') return white;
  if (name === '--ink') return INK;
  let value = themes[theme][name];
  const alias = value && value.match(/^var\(--([\w-]+)\)$/);
  if (alias) value = themes[theme][alias[1]];
  if (!value) throw new Error(`${theme}: ${name} is not defined`);
  return value;
};

for (const theme of Object.keys(SELECTORS)) {
  const dark = theme.endsWith('-dark');

  for (const family of FAMILIES) {
    let previous = null;
    for (const step of STEPS) {
      const hex = lookup(theme, `${family}-${step}`);
      if (!/^#[0-9A-F]{6}$/.test(hex)) problems.push(`${theme}: ${family}-${step} is ${hex}`);
      // Same direction all the way. A hair's slack: two steps may sit together.
      const lum = luminance(hex);
      if (previous !== null && (dark ? lum < previous - 0.002 : lum > previous + 0.002)) {
        problems.push(`${theme}: ${family}-${step} ${hex} is out of order`);
      }
      previous = lum;
    }
  }

  const grounds = GROUNDS[theme];
  const check = (role, fg, bg) => {
    const ratio = contrast(lookup(theme, fg), lookup(theme, bg));
    pairs.push({ theme, role, fg, bg, fgHex: lookup(theme, fg), bgHex: lookup(theme, bg), ratio: Number(ratio.toFixed(2)) });
    if (ratio < AA) problems.push(`${theme}: ${role}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`);
  };

  for (const [where, ground] of Object.entries(grounds)) {
    check(`Main text on ${where}`, 'neutral-900', ground);
    check(`Secondary text on ${where}`, 'neutral-700', ground);
    check(`Link on ${where}`, BRAND[theme].link, ground);
    for (const family of ['success', 'warning', 'danger', 'info']) {
      check(`${family} text on ${where}`, `${family}-700`, ground);
    }
  }
  check('Quiet text on card', 'neutral-600', grounds.card);
  for (const bg of BRAND[theme].linkOn) check(`Link on tint`, BRAND[theme].link, bg);
  for (const [fg, bg] of BRAND[theme].on) check(`Text on ${bg}`, fg, bg);
  for (const family of ['success', 'warning', 'danger', 'info']) {
    check(`${family} text on its tint`, `${family}-700`, `${family}-100`);
    check(`Text on ${family} fill`, dark ? 'neutral-50' : '--white', `${family}-500`);
    check(`${family} fill as text on card`, `${family}-500`, grounds.card);
  }
}

// The order stages are one set, shared by every theme.
for (let n = 1; n <= 16; n += 1) {
  const text = lookup('scaleezy', `stage-${n}-text`);
  const fill = lookup('scaleezy', `stage-${n}-fill`);
  const ratio = contrast(text, fill);
  pairs.push({ theme: 'scaleezy', role: `Text on stage ${n}`, fg: `stage-${n}-text`, bg: `stage-${n}-fill`, fgHex: text, bgHex: fill, ratio: Number(ratio.toFixed(2)) });
  if (ratio < AA) problems.push(`stage-${n}: text on fill is ${ratio.toFixed(2)}:1`);
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ problems, pairs }, null, 1));
} else {
  const lowest = pairs.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  console.log(`${pairs.length} pairs checked across ${Object.keys(SELECTORS).length} themes. Lowest: ${lowest.ratio}:1 (${lowest.theme}, ${lowest.role}).`);
  problems.forEach((p) => console.error(`  ✗ ${p}`));
  if (problems.length) console.error(`${problems.length} problem(s).`);
  else console.log('All pass WCAG AA.');
}
process.exit(problems.length ? 1 : 0);
