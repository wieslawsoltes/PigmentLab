import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['app', 'scripts', 'tests', 'examples', ...(await fs.readdir('packages')).map(x => `packages/${x}/src`)])
    for (const f of await fs.readdir(dir))
        if (/\.m?js$/.test(f)) {
            const result = spawnSync(process.execPath, ['--check', `${dir}/${f}`], { stdio: 'inherit' });
            if (result.status !== 0)
                process.exit(result.status || 1);
        }
console.log('All JavaScript sources pass syntax checks.');
