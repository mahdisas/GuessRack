/**
 * Stamps the live site URL into the crawler-facing files.
 *
 * seo/*.{txt,xml} are templates containing {{SITE_URL}}; the rendered copies
 * land in public/ for Vite to pick up. Runs automatically as part of the build,
 * so robots.txt and the sitemap can never drift from the deployed domain.
 *
 * Set the URL with VITE_SITE_URL — in .env locally, or as the SITE_URL build
 * arg in fly.toml.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* no .env — rely on the ambient environment (that is how CI and Fly do it) */
}

const siteUrl = (process.env.VITE_SITE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');

if (!/^https?:\/\//.test(siteUrl)) {
  console.error(`VITE_SITE_URL must be an absolute URL, got "${siteUrl}"`);
  process.exit(1);
}

const from = path.join(ROOT, 'seo');
const to = path.join(ROOT, 'public');

const files = await fs.readdir(from);
for (const name of files) {
  const template = await fs.readFile(path.join(from, name), 'utf8');
  await fs.writeFile(path.join(to, name), template.replaceAll('{{SITE_URL}}', siteUrl));
}

console.log(`SEO files written for ${siteUrl}: ${files.join(', ')}`);
