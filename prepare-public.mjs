import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
await copyFile('index.html', 'public/app.html');
await copyFile('styles.css', 'public/styles.css');
await copyFile('app.js', 'public/app.js');
