'use strict';

const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Pool } = require('pg');
const Parser = require('rss-parser');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, 'uploads');
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const FEED_URL = process.env.NEWS_FEED_URL || 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml';
const NEWS_REFRESH_MINUTES = Number(process.env.NEWS_REFRESH_MINUTES || 5);
const CATEGORIES = ['Política', 'Economia', 'Tecnologia', 'Esportes', 'Entretenimento', 'Saúde', 'Ciência', 'Educação', 'Mundo', 'Cultura'];
const GOOGLE_NEWS_FEEDS = CATEGORIES.map(category => ({
    category,
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(`${category === 'Mundo' ? 'notícias internacionais' : category.toLocaleLowerCase('pt-BR')} Brasil`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
}));
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const COOKIE_NAME = 'phnews_session';
const SESSION_DURATION_SECONDS = 8 * 60 * 60;
const HTML_PAGES = new Set([
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
    'auth.html',
    'cms.html',
    'article.html'
]);

const pool = new Pool({ connectionString: DATABASE_URL });
const rssParser = new Parser({
    timeout: 15000,
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

const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 8, parts: 9 }
});

function normalizeText(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function categoryFromItem(item) {
    const feedCategories = Array.isArray(item.categories) ? item.categories : [];
    const categoryLabels = feedCategories.map(category => {
        if (typeof category === 'string') return category;
        if (category && typeof category === 'object') {
            return ['term', 'name', 'title', '_']
                .map(key => category[key])
                .find(value => typeof value === 'string') || '';
        }
        return '';
    }).filter(Boolean).join(' ');
    const searchable = normalizeText([
        typeof item.title === 'string' ? item.title : '',
        categoryLabels,
        typeof item.contentSnippet === 'string' ? item.contentSnippet : ''
    ].join(' '));
    const rules = [
        ['Política', /\b(politic|eleic|governo|congresso|president|senado|camara|tse|votacao)/],
        ['Economia', /\b(econom|mercado|dolar|inflac|financ|emprego|negocio|banco central)/],
        ['Tecnologia', /\b(tecnolog|digital|inteligencia artificial|internet|software|inovacao digital)/],
        ['Esportes', /\b(esport|futebol|campeonato|atleta|olimpi|selecao brasileira)/],
        ['Entretenimento', /\b(entretenimento|cinema|televisao|celebridade|streaming|show|musica)/],
        ['Saúde', /\b(saude|hospit|vacina|sus|medic|doenca|epidemi)/],
        ['Ciência', /\b(ciencia|pesquisa|pesquisador|cientific|espaco|astronom|estudo)/],
        ['Educação', /\b(educacao|escola|universidade|estudante|ensino|professor)/],
        ['Cultura', /\b(cultura|arte|museu|livro|literatura|exposicao|teatro)/]
    ];

    return rules.find(([, pattern]) => pattern.test(searchable))?.[0] || 'Mundo';
}

function cleanFeedText(value) {
    const namedEntities = {
        amp: '&',
        apos: "'",
        gt: '>',
        lt: '<',
        nbsp: ' ',
        quot: '"'
    };
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
        .replace(/&#x([a-f\d]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
        .replace(/&([a-z]+);/gi, (entity, name) => namedEntities[name.toLowerCase()] ?? entity)
        .replace(/\s+/g, ' ')
        .trim();
}

function feedSourceName(item, feedName) {
    const rawSource = item.source;
    const source = typeof rawSource === 'string'
        ? rawSource
        : typeof rawSource?._ === 'string'
            ? rawSource._
            : typeof rawSource?.['#text'] === 'string'
                ? rawSource['#text']
                : '';
    if (source) return cleanFeedText(source).slice(0, 120);
    if (feedName === 'Google Notícias') {
        const publisher = item.title?.match(/\s+-\s+([^-]+)$/)?.[1]?.trim();
        if (publisher) return cleanFeedText(publisher).slice(0, 120);
    }
    return cleanFeedText(feedName || 'Agência Brasil').slice(0, 120);
}

function safeFeedUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.toString() : null;
    } catch {
        return null;
    }
}

function feedImageUrl(item) {
    const candidates = [
        item.featuredImage,
        item.enclosure?.url,
        item.mediaContent,
        item.mediaThumbnail
    ];
    for (const candidate of candidates) {
        const entries = Array.isArray(candidate) ? candidate : [candidate];
        for (const entry of entries) {
            const value = typeof entry === 'string'
                ? entry
                : entry?.url || entry?.$?.url || entry?._ || '';
            const url = safeFeedUrl(value);
            if (url) return url;
        }
    }

    const html = [item.contentEncoded, item.content, item.description]
        .find(value => typeof value === 'string' && /<img\b/i.test(value));
    const image = html?.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    return safeFeedUrl(image);
}

function uploadedImageExtension(file) {
    const buffer = file?.buffer;
    if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.length > MAX_IMAGE_BYTES) {
        return null;
    }

    const isPng = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (isPng) {
        if (buffer.length < 45 || buffer.readUInt32BE(8) !== 13 ||
            buffer.toString('ascii', 12, 16) !== 'IHDR' ||
            buffer.toString('ascii', buffer.length - 8, buffer.length - 4) !== 'IEND') {
            return null;
        }
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return file.mimetype === 'image/png' && width > 0 && height > 0 &&
            width <= 12000 && height <= 12000 && width * height <= 40000000
            ? 'png'
            : null;
    }

    if (file.mimetype !== 'image/jpeg' || buffer[0] !== 0xff || buffer[1] !== 0xd8 ||
        buffer[buffer.length - 2] !== 0xff || buffer[buffer.length - 1] !== 0xd9) {
        return null;
    }

    let offset = 2;
    while (offset + 4 < buffer.length) {
        if (buffer[offset] !== 0xff) return null;
        while (buffer[offset] === 0xff) offset++;
        const marker = buffer[offset++];
        if (marker === 0xd9 || marker === 0xda) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > buffer.length) return null;
        const segmentLength = buffer.readUInt16BE(offset);
        if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
            const height = buffer.readUInt16BE(offset + 3);
            const width = buffer.readUInt16BE(offset + 5);
            return width > 0 && height > 0 && width <= 12000 && height <= 12000 &&
                width * height <= 40000000
                ? 'jpg'
                : null;
        }
        offset += segmentLength;
    }
    return null;
}

async function storeUploadedImage(file, extension) {
    const filename = `${randomUUID()}.${extension}`;
    await fs.writeFile(path.join(UPLOAD_DIR, filename), file.buffer, { flag: 'wx' });
    return `/uploads/${filename}`;
}

function isStoredImageUrl(value) {
    return typeof value === 'string' && /^\/uploads\/[0-9a-f-]{36}\.(?:jpg|png)$/.test(value);
}

async function removeStoredImage(value) {
    if (!isStoredImageUrl(value)) return;
    try {
        await fs.unlink(path.join(UPLOAD_DIR, path.basename(value)));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

function setSessionCookie(res, user) {
    const token = jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
        name: user.name
    }, JWT_SECRET, { expiresIn: SESSION_DURATION_SECONDS });

    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: 'strict',
        maxAge: SESSION_DURATION_SECONDS * 1000,
        path: '/'
    });
}

function authenticate(req, res, next) {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
        return res.status(401).json({ error: 'Faça login para continuar.' });
    }

    try {
        const session = jwt.verify(token, JWT_SECRET);
        req.user = {
            id: session.sub,
            email: session.email,
            role: session.role,
            name: session.name
        };
        return next();
    } catch (error) {
        if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
            return next(error);
        }
        res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', path: '/' });
        return res.status(401).json({ error: 'Sua sessão expirou. Faça login novamente.' });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Somente administradores podem aprovar publicações.' });
    }
    return next();
}

function sendArticle(row, includeContent = true) {
    const article = {
        id: row.id,
        title: row.title,
        summary: row.summary,
        category: row.category,
        imageUrl: row.image_url,
        sourceName: row.source_name,
        sourceUrl: row.source_url,
        sourceKind: row.source_kind,
        status: row.status,
        authorName: row.author_name || null,
        createdAt: row.created_at,
        publishedAt: row.published_at
    };
    if (includeContent) article.content = row.content;
    return article;
}

function validateEditorialArticle(body) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';

    if (title.length < 8 || title.length > 180) {
        return { error: 'O título deve ter entre 8 e 180 caracteres.' };
    }
    if (summary.length < 20 || summary.length > 600) {
        return { error: 'O resumo deve ter entre 20 e 600 caracteres.' };
    }
    if (content.length < 40 || content.length > 30000) {
        return { error: 'A matéria deve ter entre 40 e 30.000 caracteres.' };
    }
    if (!CATEGORIES.includes(category)) {
        return { error: 'Selecione uma categoria válida.' };
    }
    if (imageUrl && !safeFeedUrl(imageUrl) && !isStoredImageUrl(imageUrl)) {
        return { error: 'A imagem deve ser um arquivo enviado ou um endereço HTTPS válido.' };
    }
    return { value: { title, summary, content, category, imageUrl: imageUrl || null } };
}

function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: null
            }
        }
    }));
    app.use(express.json({ limit: '40kb' }));
    app.use(cookieParser());
    app.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });

    app.get('/api/health', async (_req, res, next) => {
        try {
            await pool.query('SELECT 1');
            const feed = await pool.query("SELECT value, updated_at FROM app_state WHERE key = 'feed_synced_at'");
            res.json({
                status: 'ok',
                database: 'connected',
                newsUpdatedAt: feed.rows[0]?.value || null
            });
        } catch (error) {
            next(error);
        }
    });

    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 20,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        message: { error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' }
    });

    app.post('/api/auth/register', authLimiter, async (req, res, next) => {
        const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        if (name.length < 3 || name.length > 100) {
            return res.status(400).json({ error: 'O nome deve ter entre 3 e 100 caracteres.' });
        }
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
        }
        if (password.length < 12 || password.length > 128) {
            return res.status(400).json({ error: 'A senha deve ter entre 12 e 128 caracteres.' });
        }

        try {
            const passwordHash = await bcrypt.hash(password, 12);
            const result = await pool.query(
                'INSERT INTO users (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role',
                [randomUUID(), name, email, passwordHash, 'editor']
            );
            const user = result.rows[0];
            setSessionCookie(res, user);
            return res.status(201).json({ user });
        } catch (error) {
            if (error.code === '23505') {
                return res.status(409).json({ error: 'Este e-mail já possui uma conta.' });
            }
            return next(error);
        }
    });

    app.post('/api/auth/login', authLimiter, async (req, res, next) => {
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        const password = typeof req.body.password === 'string' ? req.body.password : '';
        if (!email || !password || password.length > 128) {
            return res.status(400).json({ error: 'Informe seu e-mail e sua senha.' });
        }

        try {
            const result = await pool.query(
                'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
                [email]
            );
            const user = result.rows[0];
            if (!user || !(await bcrypt.compare(password, user.password_hash))) {
                return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
            }
            setSessionCookie(res, user);
            return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
        } catch (error) {
            return next(error);
        }
    });

    app.get('/api/auth/me', (req, res, next) => {
        const token = req.cookies?.[COOKIE_NAME];
        if (!token) return res.json({ user: null });
        try {
            const session = jwt.verify(token, JWT_SECRET);
            return res.json({
                user: {
                    id: session.sub,
                    email: session.email,
                    role: session.role,
                    name: session.name
                }
            });
        } catch (error) {
            if (error.name !== 'JsonWebTokenError' && error.name !== 'TokenExpiredError') {
                return next(error);
            }
            res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', path: '/' });
            return res.json({ user: null });
        }
    });
    app.post('/api/auth/logout', (_req, res) => {
        res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', path: '/' });
        res.status(204).end();
    });

    app.get('/api/news', async (req, res, next) => {
        const category = typeof req.query.category === 'string' ? req.query.category : '';
        const search = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 18, 1), 100);
        const offset = Math.min(Math.max(Number.parseInt(req.query.offset, 10) || 0, 0), 5000);
        if (category && !CATEGORIES.includes(category)) {
            return res.status(400).json({ error: 'Categoria inválida.' });
        }

        try {
            const result = await pool.query(
                `SELECT a.*, u.name AS author_name
                 FROM articles a LEFT JOIN users u ON u.id = a.author_id
                 WHERE a.status = 'published'
                   AND ($1::text = '' OR a.category = $1)
                   AND ($2::text = '' OR a.title ILIKE '%' || $2 || '%' OR a.summary ILIKE '%' || $2 || '%')
                 ORDER BY a.published_at DESC NULLS LAST, a.id DESC
                 LIMIT $3 OFFSET $4`,
                [category, search, limit, offset]
            );
            const feed = await pool.query("SELECT value FROM app_state WHERE key = 'feed_synced_at'");
            return res.json({
                articles: result.rows.map(row => sendArticle(row, false)),
                newsUpdatedAt: feed.rows[0]?.value || null
            });
        } catch (error) {
            return next(error);
        }
    });

    app.get('/api/news/:id', async (req, res, next) => {
        try {
            const result = await pool.query(
                `SELECT a.*, u.name AS author_name
                 FROM articles a LEFT JOIN users u ON u.id = a.author_id
                 WHERE a.id = $1 AND a.status = 'published'`,
                [req.params.id]
            );
            if (!result.rows[0]) {
                return res.status(404).json({ error: 'Notícia não encontrada.' });
            }
            return res.json({ article: sendArticle(result.rows[0]) });
        } catch (error) {
            if (error.code === '22P02') {
                return res.status(400).json({ error: 'Identificador de notícia inválido.' });
            }
            return next(error);
        }
    });

    app.post('/api/articles', authenticate, imageUpload.single('image'), async (req, res, next) => {
        const extension = req.file ? uploadedImageExtension(req.file) : null;
        if (req.file && !extension) {
            return res.status(400).json({ error: 'Envie uma imagem JPEG ou PNG válida, com até 5 MB e no máximo 12.000 pixels por lado.' });
        }
        const imageUrl = extension
            ? `/uploads/${randomUUID()}.${extension}`
            : (typeof req.body.imageUrl === 'string' ? req.body.imageUrl.trim() : '');
        const validation = validateEditorialArticle({ ...req.body, imageUrl });
        if (validation.error) {
            return res.status(400).json({ error: validation.error });
        }
        const article = validation.value;
        let storedImageUrl = null;
        try {
            if (req.file && extension) {
                storedImageUrl = await storeUploadedImage(req.file, extension);
                article.imageUrl = storedImageUrl;
            }
            const result = await pool.query(
                `INSERT INTO articles
                    (id, source_kind, title, summary, content, category, image_url, source_name, source_url, author_id, status)
                 VALUES ($1, 'editorial', $2, $3, $4, $5, $6, 'Redação PHNews', '/', $7, 'pending')
                 RETURNING *`,
                [randomUUID(), article.title, article.summary, article.content, article.category, article.imageUrl, req.user.id]
            );
            return res.status(201).json({
                article: sendArticle({ ...result.rows[0], author_name: req.user.name })
            });
        } catch (error) {
            if (storedImageUrl) {
                try {
                    await removeStoredImage(storedImageUrl);
                } catch (cleanupError) {
                    return next(new AggregateError([error, cleanupError], 'A notícia não foi salva e o arquivo enviado não pôde ser removido.'));
                }
            }
            return next(error);
        }
    });

    app.get('/api/articles/mine', authenticate, async (req, res, next) => {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
        const offset = Math.min(Math.max(Number.parseInt(req.query.offset, 10) || 0, 0), 5000);
        try {
            const result = await pool.query(
                `SELECT a.*, u.name AS author_name
                 FROM articles a LEFT JOIN users u ON u.id = a.author_id
                 WHERE a.source_kind = 'editorial'
                   AND ($2::boolean OR a.author_id = $1::uuid)
                 ORDER BY a.created_at DESC, a.id DESC LIMIT $3 OFFSET $4`,
                [req.user.id, req.user.role === 'admin', limit, offset]
            );
            return res.json({ articles: result.rows.map(sendArticle) });
        } catch (error) {
            return next(error);
        }
    });

    app.put('/api/articles/:id', authenticate, imageUpload.single('image'), async (req, res, next) => {
        if (req.file && req.body.removeImage === 'true') {
            return res.status(400).json({ error: 'Escolha entre enviar uma nova imagem ou remover a atual.' });
        }
        const extension = req.file ? uploadedImageExtension(req.file) : null;
        if (req.file && !extension) {
            return res.status(400).json({ error: 'Envie uma imagem JPEG ou PNG válida, com até 5 MB e no máximo 12.000 pixels por lado.' });
        }
        const imageUrl = extension ? `/uploads/${randomUUID()}.${extension}` : '';
        const validation = validateEditorialArticle({ ...req.body, imageUrl });
        if (validation.error) {
            return res.status(400).json({ error: validation.error });
        }
        const article = validation.value;
        const removeImage = req.body.removeImage === 'true';
        let storedImageUrl = null;
        let previousImageUrl = null;
        let articleSaved = false;
        try {
            const existing = await pool.query(
                `SELECT image_url FROM articles
                 WHERE id = $1::uuid
                   AND source_kind = 'editorial'
                   AND ($2::boolean OR author_id = $3::uuid)`,
                [req.params.id, req.user.role === 'admin', req.user.id]
            );
            if (!existing.rows[0]) {
                return res.status(404).json({ error: 'Matéria editorial não encontrada ou sem permissão para editá-la.' });
            }
            previousImageUrl = existing.rows[0].image_url;
            if (req.file && extension) {
                storedImageUrl = await storeUploadedImage(req.file, extension);
                article.imageUrl = storedImageUrl;
            }
            const result = await pool.query(
                `UPDATE articles
                 SET title = $2, summary = $3, content = $4, category = $5,
                     image_url = CASE WHEN $7::boolean THEN NULL ELSE COALESCE($6, image_url) END,
                     updated_at = NOW()
                 WHERE id = $1::uuid
                   AND source_kind = 'editorial'
                   AND ($8::boolean OR author_id = $9::uuid)
                 RETURNING *`,
                [req.params.id, article.title, article.summary, article.content, article.category,
                    article.imageUrl, removeImage, req.user.role === 'admin', req.user.id]
            );
            if (!result.rows[0]) {
                if (storedImageUrl) await removeStoredImage(storedImageUrl);
                return res.status(404).json({ error: 'Matéria editorial não encontrada ou sem permissão para editá-la.' });
            }
            articleSaved = true;
            const nextImageUrl = removeImage ? null : storedImageUrl || previousImageUrl;
            if (previousImageUrl !== nextImageUrl) {
                try {
                    await removeStoredImage(previousImageUrl);
                } catch (cleanupError) {
                    console.error('A matéria foi atualizada, mas a imagem de capa anterior não pôde ser removida:', cleanupError);
                }
            }
            const updated = await pool.query(
                'SELECT name FROM users WHERE id = $1::uuid',
                [result.rows[0].author_id]
            );
            return res.json({
                article: sendArticle({
                    ...result.rows[0],
                    author_name: updated.rows[0]?.name || 'Autor removido'
                })
            });
        } catch (error) {
            if (error.code === '22P02') {
                if (storedImageUrl && !articleSaved) {
                    try {
                        await removeStoredImage(storedImageUrl);
                    } catch (cleanupError) {
                        return next(new AggregateError([error, cleanupError], 'A matéria não foi atualizada e o arquivo enviado não pôde ser removido.'));
                    }
                }
                return res.status(400).json({ error: 'Identificador de matéria inválido.' });
            }
            if (storedImageUrl && !articleSaved) {
                try {
                    await removeStoredImage(storedImageUrl);
                } catch (cleanupError) {
                    return next(new AggregateError([error, cleanupError], 'A matéria não foi atualizada e o arquivo enviado não pôde ser removido.'));
                }
            }
            return next(error);
        }
    });

    app.get('/api/admin/articles/pending', authenticate, requireAdmin, async (_req, res, next) => {
        try {
            const result = await pool.query(
                `SELECT a.*, u.name AS author_name
                 FROM articles a LEFT JOIN users u ON u.id = a.author_id
                 WHERE a.source_kind = 'editorial' AND a.status = 'pending'
                 ORDER BY a.created_at ASC LIMIT 100`
            );
            return res.json({ articles: result.rows.map(sendArticle) });
        } catch (error) {
            return next(error);
        }
    });

    app.post('/api/admin/articles/:id/:decision', authenticate, requireAdmin, async (req, res, next) => {
        const decisions = { publish: 'published', reject: 'rejected' };
        const status = decisions[req.params.decision];
        if (!status) {
            return res.status(404).json({ error: 'Ação editorial não encontrada.' });
        }
        try {
            const result = await pool.query(
                `UPDATE articles
                 SET status = $1, published_at = CASE WHEN $2 THEN NOW() ELSE NULL END, updated_at = NOW()
                 WHERE id = $3 AND source_kind = 'editorial' AND status = 'pending'
                 RETURNING id`,
                [status, status === 'published', req.params.id]
            );
            if (!result.rows[0]) {
                return res.status(404).json({ error: 'Rascunho não encontrado ou já revisado.' });
            }
            return res.json({ status });
        } catch (error) {
            if (error.code === '22P02') {
                return res.status(400).json({ error: 'Identificador de matéria inválido.' });
            }
            return next(error);
        }
    });

    app.delete('/api/articles/:id', authenticate, async (req, res, next) => {
        try {
            const result = await pool.query(
                `DELETE FROM articles
                 WHERE id = $1
                   AND source_kind = 'editorial'
                   AND ($2::uuid = author_id OR $3::boolean)
                 RETURNING id, image_url`,
                [req.params.id, req.user.id, req.user.role === 'admin']
            );
            if (!result.rows[0]) {
                return res.status(404).json({ error: 'Matéria editorial não encontrada ou sem permissão para removê-la.' });
            }
            try {
                await removeStoredImage(result.rows[0].image_url);
            } catch (cleanupError) {
                console.error('A matéria foi removida, mas o arquivo da imagem de capa não pôde ser removido:', cleanupError);
            }
            return res.status(204).end();
        } catch (error) {
            if (error.code === '22P02') {
                return res.status(400).json({ error: 'Identificador de matéria inválido.' });
            }
            return next(error);
        }
    });

    app.use('/css', express.static(path.join(ROOT, 'css'), { maxAge: '1h' }));
    app.use('/img', express.static(path.join(ROOT, 'img'), { maxAge: '1d' }));
    app.use('/js', express.static(path.join(ROOT, 'js'), { maxAge: '1h' }));
    app.use('/uploads', express.static(UPLOAD_DIR, { dotfiles: 'deny', immutable: true, maxAge: '1y' }));
    app.get('/:page', (req, res, next) => {
        if (!HTML_PAGES.has(req.params.page)) {
            return next();
        }
        return res.sendFile(path.join(ROOT, req.params.page));
    });
    app.get('/', (_req, res) => res.sendFile(path.join(ROOT, 'index.html')));
    app.use((_req, res) => res.status(404).json({ error: 'Página ou recurso não encontrado.' }));
    app.use((error, _req, res, _next) => {
        if (error.type === 'entity.too.large') {
            return res.status(413).json({ error: 'A requisição excede o limite permitido.' });
        }
        if (error instanceof multer.MulterError) {
            const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            const message = error.code === 'LIMIT_FILE_SIZE'
                ? 'A imagem deve ter no máximo 5 MB.'
                : 'Envie apenas uma imagem por matéria e preencha os demais campos corretamente.';
            return res.status(status).json({ error: message });
        }
        console.error('Falha na requisição:', error);
        return res.status(500).json({ error: 'Ocorreu um erro interno. Tente novamente em instantes.' });
    });
    return app;
}

async function initializeDatabase() {
    if (!DATABASE_URL) throw new Error('DATABASE_URL é obrigatória.');
    if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.');
    if (!ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL)) throw new Error('ADMIN_EMAIL inválido.');
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12 || ADMIN_PASSWORD.length > 128) {
        throw new Error('ADMIN_PASSWORD deve ter entre 12 e 128 caracteres.');
    }
    if (!Number.isInteger(NEWS_REFRESH_MINUTES) || NEWS_REFRESH_MINUTES < 1 || NEWS_REFRESH_MINUTES > 1440) {
        throw new Error('NEWS_REFRESH_MINUTES deve ser um número entre 1 e 1440.');
    }
    if (!safeFeedUrl(FEED_URL)) throw new Error('NEWS_FEED_URL deve usar HTTPS.');

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const schema = await fs.readFile(path.join(ROOT, 'schema.sql'), 'utf8');
    await pool.query(schema);
    const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await pool.query(
        `INSERT INTO users (id, name, email, password_hash, role)
         VALUES ($1, 'Administrador PHNews', $2, $3, 'admin')
         ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
        [randomUUID(), ADMIN_EMAIL, adminHash]
    );
}

async function importFeed(feedUrl, defaultCategory = '', feedName = 'Agência Brasil') {
    const feed = await rssParser.parseURL(feedUrl);
    let imported = 0;
    for (const item of feed.items) {
        const sourceUrl = safeFeedUrl(item.link);
        const sourceName = feedSourceName(item, feedName);
        const feedTitle = typeof item.title === 'string' ? item.title : '';
        const unbrandedTitle = feedTitle.replace(/\s+-\s+[^-]+$/, '').trim();
        const title = cleanFeedText(defaultCategory && feedName === 'Google Notícias' ? unbrandedTitle : feedTitle).slice(0, 180);
        if (!sourceUrl || title.length < 8) continue;

        const sourceKey = cleanFeedText(item.guid || sourceUrl).slice(0, 2000);
        const summary = cleanFeedText(item.contentSnippet || item.description || title).slice(0, 600);
        const imageUrl = feedImageUrl(item);
        const parsedDate = new Date(item.isoDate || item.pubDate || Date.now());
        const publishedAt = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
        const articleId = randomUUID();

        const result = await pool.query(
            `INSERT INTO articles
                (id, source_kind, source_key, title, summary, category, image_url, source_name, source_url, status, published_at, updated_at)
             VALUES ($1, 'rss', $2, $3, $4, $5, $6, $7, $8, 'published', $9, NOW())
             ON CONFLICT (source_key) DO UPDATE SET
                title = EXCLUDED.title,
                summary = EXCLUDED.summary,
                category = EXCLUDED.category,
                image_url = EXCLUDED.image_url,
                source_name = EXCLUDED.source_name,
                source_url = EXCLUDED.source_url,
                published_at = EXCLUDED.published_at,
                updated_at = NOW()
             WHERE articles.source_kind = 'rss'
             RETURNING id`,
            [
                articleId,
                sourceKey,
                title,
                summary,
                defaultCategory || categoryFromItem(item),
                imageUrl,
                sourceName,
                sourceUrl,
                publishedAt
            ]
        );
        imported += result.rowCount;
    }
    return imported;
}

async function syncFeed() {
    const feeds = [
        { url: FEED_URL, category: '', name: 'Agência Brasil' },
        ...GOOGLE_NEWS_FEEDS.map(feed => ({ ...feed, name: 'Google Notícias' }))
    ];
    const errors = [];
    let imported = 0;
    let cursor = 0;
    async function syncWorker() {
        while (cursor < feeds.length) {
            const index = cursor++;
            const feed = feeds[index];
            try {
                const count = await importFeed(feed.url, feed.category, feed.name);
                imported += count;
                if (feed.category) {
                    console.info(`Feed ${feed.category} atualizado: ${count} notícia(s).`);
                }
            } catch (error) {
                errors.push(feed.category || feed.name);
                console.error(`Falha ao atualizar feed ${feed.category || feed.name}; notícias já importadas foram preservadas:`, error);
            }
        }
    }
    await Promise.all(Array.from({ length: Math.min(feeds.length, 3) }, syncWorker));

    await pool.query(
        `DELETE FROM articles
         WHERE source_kind = 'rss' AND published_at < NOW() - INTERVAL '30 days'`
    );
    const syncedAt = new Date().toISOString();
    await pool.query(
        `INSERT INTO app_state (key, value) VALUES ('feed_synced_at', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [syncedAt]
    );
    console.info(`Atualização de notícias concluída: ${imported} item(ns) sincronizados; ${errors.length} feed(s) com falha.`);
}

async function start() {
    await initializeDatabase();
    const app = createApp();
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.info(`PHNews disponível na porta ${PORT}.`);
    });

    async function refreshNews() {
        try {
            await syncFeed();
        } catch (error) {
            console.error('Não foi possível atualizar o feed RSS; notícias já importadas foram preservadas:', error);
        }
    }

    await refreshNews();
    const interval = setInterval(refreshNews, NEWS_REFRESH_MINUTES * 60 * 1000);
    interval.unref();
    const close = () => {
        clearInterval(interval);
        server.close(() => pool.end().finally(() => process.exit(0)));
    };
    process.once('SIGTERM', close);
    process.once('SIGINT', close);
}

if (require.main === module) {
    start().catch(async (error) => {
        console.error('Não foi possível iniciar o PHNews:', error);
        await pool.end();
        process.exitCode = 1;
    });
}

module.exports = {
    categoryFromItem,
    cleanFeedText,
    createApp,
    feedSourceName,
    feedImageUrl,
    GOOGLE_NEWS_FEEDS,
    importFeed,
    safeFeedUrl,
    syncFeed,
    uploadedImageExtension,
    validateEditorialArticle
};
