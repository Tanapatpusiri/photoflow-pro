import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
await mkdir('public/resume', { recursive: true });
await copyFile('index.html', 'public/app.html');
await copyFile('styles.css', 'public/styles.css');
await copyFile('app.js', 'public/app.js');
await copyFile('resume-portfolio/index.html', 'public/resume/index.html');
