import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const distDir = path.join(projectRoot, 'dist');
const stampPath = path.join(distDir, '.build-stamp');

const watchedFiles = [
    'index.html',
    'package.json',
    'package-lock.json',
    'svelte.config.js',
    'tsconfig.app.json',
    'tsconfig.json',
    'tsconfig.node.json',
    'vite.config.ts'
].map((value) => path.join(projectRoot, value));

const watchedDirs = ['public', 'src'].map((value) => path.join(projectRoot, value));

function latestMtimeMs(value) {
    if (!existsSync(value)) {
        return 0;
    }

    const stats = statSync(value);

    if (stats.isFile()) {
        return stats.mtimeMs;
    }

    let latest = stats.mtimeMs;

    for (const entry of readdirSync(value, { withFileTypes: true })) {
        latest = Math.max(latest, latestMtimeMs(path.join(value, entry.name)));
    }

    return latest;
}

function buildFrontend() {
    const result = spawnSync('npm run build', {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: true
    });

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }

    mkdirSync(distDir, { recursive: true });
    writeFileSync(stampPath, `${Date.now()}\n`);
}

const latestInputMtimeMs = Math.max(
    ...watchedFiles.map((value) => latestMtimeMs(value)),
    ...watchedDirs.map((value) => latestMtimeMs(value))
);
const stampMtimeMs = latestMtimeMs(stampPath);

if (!existsSync(distDir) || stampMtimeMs < latestInputMtimeMs) {
    buildFrontend();
} else {
    console.log('Frontend build is up to date, skipping Vite build.');
}
