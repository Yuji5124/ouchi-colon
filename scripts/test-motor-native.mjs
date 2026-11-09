import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = process.env.CXX ?? (existsSync('C:/msys64/mingw64/bin/g++.exe') ? 'C:/msys64/mingw64/bin/g++.exe' : 'g++');
const output = resolve(root, '.motor-build'); mkdirSync(output, { recursive: true });
const binary = resolve(output, process.platform === 'win32' ? 'motor-safety-tests.exe' : 'motor-safety-tests');
const env = { ...process.env, PATH: dirname(compiler) + (process.platform === 'win32' ? ';' : ':') + (process.env.PATH ?? '') };
const build = spawnSync(compiler, ['-std=c++17', '-Wall', '-Wextra', '-Werror', '-pedantic', resolve(root, 'firmware/tests/motor_safety_test.cpp'), '-o', binary], { encoding: 'utf8', env });
if (build.error || build.status !== 0) { console.error(build.error ?? build.stderr); process.exit(1); }
const run = spawnSync(binary, [], { encoding: 'utf8', env });
const log = (run.stdout ?? '') + (run.stderr ?? '') + (run.error ? String(run.error) : '');
writeFileSync(resolve(output, 'native-tests.log'), log); console.log(log);
if (run.status !== 0) process.exit(run.status ?? 1);
