'use strict';

const CACHE_NAME = 'phnews-offline-v1';
const IMAGE_CACHE = 'phnews-images-v1';
const MAX_CACHED_IMAGES = 80;
const SHELL_FILES = [
    './',
    './index.html',
    './categorias.html',
    './ciencia.html',
    './contato.html',
    './cultura.html',
    './economia.html',
    './educacao.html',
    './entretenimento.html',
    './esportes.html',
    './mundo.html',
    './politica.html',
    './saude.html',
    './tecnologia.html',
    './article.html',
    './css/style.css',
    './js/auth.js',
    './js/news.js',
    './js/article.js',
    './js/script.js',
    './manifest.webmanifest',
    './site-config.json',
    './news.json',
    './img/logo-phnews.png',
    './img/hero-phnews.jpg',
    './img/hero-news.svg',
    './img/news-ciencia.svg',
    './img/news-cultura.svg',
    './img/news-economia.svg',
    './img/news-educacao.svg',
    './img/news-entretenimento.svg',
    './img/news-esportes.svg',
    './img/news-mundo.svg',
    './img/news-politica.svg',
    './img/news-saude.svg',
    './img/news-tecnologia.svg'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter(name => name.startsWith('phnews-') && name !== CACHE_NAME && name !== IMAGE_CACHE)
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

async function fetchAndCacheImage(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    const update = fetch(request).then(async response => {
        if (response.ok || response.type === 'opaque') {
            await cache.put(request, response.clone());
            const keys = await cache.keys();
            await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_CACHED_IMAGES))
                .map(key => cache.delete(key)));
        }
        return response;
    }).catch(() => null);

    if (cached) {
        update.catch(error => console.warn('Não foi possível atualizar uma imagem em cache:', error));
        return cached;
    }
    return (await update) || Response.error();
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin === self.location.origin && /\/api(?:\/|$)/.test(url.pathname)) return;

    if (request.destination === 'image') {
        event.respondWith(fetchAndCacheImage(request));
        return;
    }

    if (url.origin !== self.location.origin) return;

    if (url.pathname.endsWith('/news.json')) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            const cached = await cache.match(request);
            const update = fetch(request).then(async response => {
                if (response.ok) await cache.put(request, response.clone());
                return response;
            }).catch(() => null);
            if (cached) {
                update.catch(error => console.warn('Não foi possível atualizar a cópia offline:', error));
                return cached;
            }
            return (await update) || Response.error();
        })());
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response.ok) {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, response.clone());
                }
                return response;
            } catch {
                const cache = await caches.open(CACHE_NAME);
                return (await cache.match(request, { ignoreSearch: true })) ||
                    (await cache.match('./index.html')) ||
                    Response.error();
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
    })());
});
