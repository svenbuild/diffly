import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const nodeCommand = process.execPath;
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: projectRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32' && command.endsWith('.cmd')
    });

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

run(nodeCommand, [path.join(scriptDir, 'ensure-frontend-build.mjs'), '--debug']);
run(npxCommand, [
    'tauri',
    'build',
    '--debug',
    '--config',
    'src-tauri/tauri.build.conf.json',
    '--no-bundle',
    '--',
    '--no-default-features',
    '--features',
    'window-state'
]);
