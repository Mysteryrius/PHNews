'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    categoryFromItem,
    cleanFeedText,
    feedImageUrl,
    feedSourceName,
    GOOGLE_NEWS_FEEDS,
    safeFeedUrl,
    uploadedImageExtension,
    validateEditorialArticle
} = require('../server');

test('categorizes RSS headlines and defaults unclassified items to Mundo', () => {
    assert.equal(categoryFromItem({ title: 'TSE anuncia novas regras eleitorais' }), 'Política');
    assert.equal(categoryFromItem({ title: 'Hospitais recebem novos equipamentos' }), 'Saúde');
    assert.equal(categoryFromItem({ title: 'Festival de teatro abre inscrições' }), 'Cultura');
    assert.equal(categoryFromItem({ title: 'Condições do tempo nesta semana' }), 'Mundo');
});

test('reads category labels from namespaced RSS metadata and source publishers', () => {
    assert.equal(
        categoryFromItem({ title: 'Educadores apresentam novo projeto', categories: [{ _: 'Educação', $: { domain: 'https://example.test/education' } }] }),
        'Educação'
    );
    assert.equal(feedSourceName({ source: { _: 'G1', $: { url: 'https://g1.globo.com' } } }, 'Google Notícias'), 'G1');
    assert.equal(GOOGLE_NEWS_FEEDS.length, 10);
    assert.deepEqual(GOOGLE_NEWS_FEEDS.map(feed => feed.category), [
        'Política', 'Economia', 'Tecnologia', 'Esportes', 'Entretenimento',
        'Saúde', 'Ciência', 'Educação', 'Mundo', 'Cultura'
    ]);
    assert.ok(GOOGLE_NEWS_FEEDS.every(feed => safeFeedUrl(feed.url)?.startsWith('https://news.google.com/')));
});

test('extracts secure RSS cover images from publisher metadata and article markup', () => {
    assert.equal(
        feedImageUrl({ featuredImage: 'https://images.example.test/cover.jpg' }),
        'https://images.example.test/cover.jpg'
    );
    assert.equal(
        feedImageUrl({ mediaThumbnail: [{ $: { url: 'https://images.example.test/thumb.png' } }] }),
        'https://images.example.test/thumb.png'
    );
    assert.equal(
        feedImageUrl({ content: '<p>Story</p><img src="https://images.example.test/story.jpg">' }),
        'https://images.example.test/story.jpg'
    );
    assert.equal(feedImageUrl({ content: '<img src="http://images.example.test/story.jpg">' }), null);
});

test('accepts bounded JPEG and PNG uploads with matching image signatures', () => {
    const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
        'base64'
    );
    assert.equal(uploadedImageExtension({ buffer: png, mimetype: 'image/png' }), 'png');
    assert.equal(uploadedImageExtension({ buffer: png, mimetype: 'image/jpeg' }), null);
    assert.equal(uploadedImageExtension({ buffer: Buffer.from('<svg></svg>'), mimetype: 'image/png' }), null);
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(oversized);
    oversized.writeUInt32BE(13, 8);
    oversized.write('IHDR', 12, 'ascii');
    oversized.writeUInt32BE(1, 16);
    oversized.writeUInt32BE(1, 20);
    oversized.write('IEND', oversized.length - 8, 'ascii');
    assert.equal(uploadedImageExtension({ buffer: oversized, mimetype: 'image/png' }), null);
});

test('strips HTML and decodes common and numeric RSS entities', () => {
    assert.equal(cleanFeedText('<p>Brasil &amp; mundo &#8212; notícia</p>'), 'Brasil & mundo — notícia');
});

test('accepts HTTPS URLs and rejects unsafe or malformed URL schemes', () => {
    assert.equal(safeFeedUrl('https://agenciabrasil.ebc.com.br/noticia'), 'https://agenciabrasil.ebc.com.br/noticia');
    assert.equal(safeFeedUrl('javascript:alert(1)'), null);
    assert.equal(safeFeedUrl('http://example.com/image.jpg'), null);
    assert.equal(safeFeedUrl('not a URL'), null);
});

test('validates CMS content and allows HTTPS or locally uploaded cover images', () => {
    const validArticle = {
        title: 'Nova iniciativa amplia acesso à educação',
        summary: 'O projeto amplia o acesso e moderniza a rede pública de ensino.',
        content: 'Uma nova iniciativa educacional foi anunciada e deve ampliar o acesso às escolas públicas.',
        category: 'Educação',
        imageUrl: 'https://example.com/foto.jpg'
    };
    assert.equal(validateEditorialArticle(validArticle).value.category, 'Educação');
    assert.equal(
        validateEditorialArticle({ ...validArticle, imageUrl: '/uploads/7e2b58cc-cc4c-4f9c-8d44-8cfaef701019.png' }).value.imageUrl,
        '/uploads/7e2b58cc-cc4c-4f9c-8d44-8cfaef701019.png'
    );
    assert.match(validateEditorialArticle({ ...validArticle, category: 'Javascript' }).error, /categoria/i);
    assert.match(validateEditorialArticle({ ...validArticle, imageUrl: 'javascript:alert(1)' }).error, /imagem/i);
    assert.match(validateEditorialArticle({ ...validArticle, title: 'Curto' }).error, /título/i);
});
