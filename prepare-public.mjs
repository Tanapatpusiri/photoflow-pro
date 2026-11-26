import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public', { recursive: true });
await copyFile('index.html', 'public/app.html');
await copyFile('styles.css', 'public/styles.css');
await copyFile('app.js', 'public/app.js');

const faces='public/football-gallery-face-model';
const human='node_modules/@vladmandic/human';
await mkdir(faces,{recursive:true});
await copyFile(human+'/dist/human.js',faces+'/human.js');
await copyFile(human+'/LICENSE',faces+'/LICENSE');
for(const model of ['blazeface','facemesh','faceres']){
 for(const extension of ['json','bin']){
  const file=model+'.'+extension;
  await copyFile(human+'/models/'+file,faces+'/'+file);
 }
}
