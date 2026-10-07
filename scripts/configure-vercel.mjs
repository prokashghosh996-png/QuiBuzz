import { writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';

// Run only after the backend is deployed. No credentials belong in this URL.
const argument = process.argv[2];
if (!argument) {
  console.error('Usage: node scripts/configure-vercel.mjs https://YOUR-BACKEND.onrender.com');
  process.exit(1);
}
const backend = new URL(argument);
if (
  backend.protocol !== 'https:' ||
  backend.username ||
  backend.password ||
  backend.search ||
  backend.hash ||
  backend.pathname !== '/'
) {
  throw new Error(
    'Provide the public HTTPS backend origin, without credentials, paths or query parameters.',
  );
}
const config = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: 'vite',
  installCommand: 'npm ci --include=dev',
  buildCommand: 'npx vite build',
  outputDirectory: 'dist',
  rewrites: [
    { source: '/api/:path*', destination: `${backend.origin}/api/:path*` },
    { source: '/((?!api(?:/|$)).*)', destination: '/index.html' },
  ],
};
writeFileSync(new URL('../vercel.json', import.meta.url), JSON.stringify(config, null, 2) + '\n');
console.log(`Configured Vercel frontend to use ${backend.origin}.`);
