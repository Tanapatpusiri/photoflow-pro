import { mkdir, copyFile, writeFile } from 'node:fs/promises';

await mkdir('.vercel/output/static', { recursive: true });
for (const file of ['index.html', 'styles.css', 'app.js']) {
  await copyFile(file, `.vercel/output/static/${file}`);
}
await writeFile('.vercel/output/config.json', JSON.stringify({ version: 3 }));
