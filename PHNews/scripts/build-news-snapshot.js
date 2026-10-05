'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const Parser = require('rss-parser');
const {
    categoryFromItem,
    cleanFeedText,
    feedImageUrl,
    feedSourceName,
    GOOGLE_NEWS_FEEDS,
    safeFeedUrl
} = require('../server');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'news.json');
const FEED_URL = process.env.NEWS_FEED_URL || 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml';
const MAX_PER_CATEGORY = Math.min(Math.max(Number.parseInt(process.env.NEWS_SNAPSHOT_PER_CATEGORY, 10) || 40, 10), 100);
const parser = new Parser({
    timeout: 20000,
    headers: { 'User-Agent': 'PHNews/1.0 (+RSS feed reader)' },
    customFields: {
        item: [
            ['imagem-destaque', 'featuredImage'],
            ['media:content', 'mediaContent', { keepArray: true }],
            ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
            ['content:encoded', 'contentEncoded'],
            ['source', 'source']
        ]
    }
});

async function readFeed(feed) {
    const parsed = await parser.parseURL(feed.url);
    const publishedArticles = [];

    for (const item of parsed.items) {
        const sourceUrl = safeFeedUrl(item.link);
        const feedTitle = typeof item.title === 'string' ? item.title : '';
        const unbrandedTitle = feedTitle.replace(/\s+-\s+[^-]+$/, '').trim();
        const title = cleanFeedText(feed.category && feed.name === 'Google Notícias' ? unbrandedTitle : feedTitle).slice(0, 180);
        if (!sourceUrl || title.length < 8) continue;

        const sourceName = feedSourceName(item, feed.name);
        const category = feed.category || categoryFromItem(item);
        const summary = cleanFeedText(item.contentSnippet || item.description || title).slice(0, 600);
        const parsedDate = new Date(item.isoDate || item.pubDate || Date.now());
        const publishedAt = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

        publishedArticles.push({
            id: sourceUrl,
            title,
            summary,
            category,
            imageUrl: feedImageUrl(item),
            sourceName,
            sourceUrl,
            sourceKind: 'rss',
            status: 'published',
            authorName: null,
            createdAt: publishedAt,
            publishedAt
        });

        if (publishedArticles.length >= (feed.category ? MAX_PER_CATEGORY : 100)) break;
    }
    return publishedArticles;
}

async function main() {
    const feeds = [
        { url: FEED_URL, category: '', name: 'Agência Brasil' },
        ...GOOGLE_NEWS_FEEDS.map(feed => ({ ...feed, name: 'Google Notícias' }))
    ];
    const errors = [];
    const articlesByFeed = new Array(feeds.length);
    let cursor = 0;
    async function fetchWorker() {
        while (cursor < feeds.length) {
            const index = cursor++;
            const feed = feeds[index];
            try {
                const articles = await readFeed(feed);
                console.info(`${feed.category || feed.name}: ${articles.length} notícia(s) incluída(s) na cópia estática.`);
                articlesByFeed[index] = articles;
            } catch (error) {
                const label = feed.category || feed.name;
                errors.push(label);
                console.error(`Não foi possível atualizar o feed ${label}:`, error.message);
                articlesByFeed[index] = [];
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(feeds.length, 3) }, fetchWorker));

    const uniqueArticles = new Map();
    for (const article of articlesByFeed.flat()) {
        const duplicateKey = `${article.category}:${article.title.toLocaleLowerCase('pt-BR')}`;
        if (!uniqueArticles.has(duplicateKey)) uniqueArticles.set(duplicateKey, article);
    }
    const articles = [...uniqueArticles.values()]
        .sort((left, right) => new Date(right.publishedAt) - new Date(left.publishedAt));
    if (articles.length === 0) {
        throw new Error('Nenhuma notícia foi obtida; a cópia anterior, se houver, foi preservada.');
    }

    const snapshot = {
        updatedAt: new Date().toISOString(),
        articles
    };
    await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
    const temporaryOutput = `${OUTPUT}.tmp`;
    await fs.writeFile(temporaryOutput, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryOutput, OUTPUT);
    console.info(`Cópia estática criada com ${articles.length} notícias; ${errors.length} feed(s) indisponível(is).`);
}

main().catch(error => {
    console.error('Não foi possível criar a cópia estática de notícias:', error);
    process.exitCode = 1;
});
