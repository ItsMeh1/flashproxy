import { readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { spawn } from 'node:child_process';

const roots = ['src', 'rewriters', 'public', 'tests'];
const ignored = new Set(['node_modules', '.git']);
const files = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extname(entry.name) === '.js' || extname(entry.name) === '.mjs') files.push(path);
  }
}

for (const root of roots) await walk(root);

await Promise.all(files.map(file => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ['--check', file], { stdio: 'inherit' });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Syntax check failed: ${file}`)));
})));

console.log(`Checked ${files.length} JavaScript files successfully.`);
