'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'dist');
const PAGES = [
    'index.html',
    'categorias.html',
    'ciencia.html',
    'contato.html',
    'cultura.html',
    'economia.html',
    'educacao.html',
    'entretenimento.html',
    'esportes.html',
    'mundo.html',
    'politica.html',
    'saude.html',
    'tecnologia.html',
    'article.html'
];

async function build() {
    const sourceSnapshot = path.join(ROOT, 'news.json');
    await fs.access(sourceSnapshot);

    await fs.rm(OUTPUT, { recursive: true, force: true });
    await fs.mkdir(OUTPUT, { recursive: true });
    await fs.copyFile(sourceSnapshot, path.join(OUTPUT, 'news.json'));
    for (const directory of ['css', 'img', 'js']) {
        await fs.cp(path.join(ROOT, directory), path.join(OUTPUT, directory), { recursive: true });
    }
    for (const page of PAGES) {
        let html = await fs.readFile(path.join(ROOT, page), 'utf8');
        if (!html.includes('rel="manifest"')) {
            html = html.replace('</head>', '    <link rel="manifest" href="manifest.webmanifest">\n</head>');
        }
        await fs.writeFile(path.join(OUTPUT, page), html, 'utf8');
    }
    await fs.copyFile(path.join(ROOT, 'sw.js'), path.join(OUTPUT, 'sw.js'));
    await fs.copyFile(path.join(ROOT, 'manifest.webmanifest'), path.join(OUTPUT, 'manifest.webmanifest'));
    await fs.writeFile(
        path.join(OUTPUT, 'site-config.json'),
        `${JSON.stringify({ mode: 'static', updatedAt: new Date().toISOString() }, null, 2)}\n`,
        'utf8'
    );
    console.info(`Site estático preparado em ${path.relative(ROOT, OUTPUT)}.`);
}

build().catch(error => {
    console.error('Não foi possível preparar o site estático:', error);
    process.exitCode = 1;
});
