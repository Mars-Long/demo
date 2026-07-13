// Build orchestrator: content script (esbuild) + sidebar React app (vite)
import { execSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, 'dist');

// 1. Generate icons
console.log('🎨 Generating icons...');
execSync('node gen-icons.mjs', { cwd: __dirname, stdio: 'inherit' });

// 2. Clean dist
if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(dist, { recursive: true });

// 3. Build content script with esbuild
console.log('🔨 Building content script...');
execSync(
  'npx esbuild src/content/index.ts --bundle --outfile=dist/content.js --target=chrome100 --format=iife',
  { cwd: __dirname, stdio: 'inherit' }
);

// 4. Build sidebar React app with Vite
console.log('🔨 Building sidebar React app...');
execSync('npx vite build', { cwd: __dirname, stdio: 'inherit' });

// 4. Copy manifest + icons
console.log('📋 Copying manifest + icons...');
cpSync(resolve(__dirname, 'manifest.json'), resolve(dist, 'manifest.json'));
cpSync(resolve(__dirname, 'src/icons'), resolve(dist, 'icons'), { recursive: true });

// 5. Validate
const required = ['manifest.json', 'content.js', 'sidebar/index.html', 'icons/icon128.png'];
const missing = required.filter(f => !existsSync(resolve(dist, f)));
if (missing.length) {
  console.error('❌ Missing files:', missing.join(', '));
  process.exit(1);
}

console.log('✅ Extension built to dist/ — load as unpacked extension in chrome://extensions');
