document.addEventListener('DOMContentLoaded', async () => {
    const notice = document.getElementById('articleNotice');
    const content = document.getElementById('articleContent');
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (!id) {
        notice.textContent = 'O link desta notícia está incompleto.';
        return;
    }

    try {
        const response = await fetch(`/api/news/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível abrir esta matéria.');
        const article = data.article;
        document.title = `${article.title} | PHNews`;
        document.getElementById('articleCategory').textContent = article.category;
        document.getElementById('articleTitle').textContent = article.title;
        document.getElementById('articleSummary').textContent = article.summary;
        document.getElementById('articleByline').textContent = article.sourceKind === 'rss'
            ? `Fonte: ${article.sourceName}`
            : `Por ${article.authorName || article.sourceName}`;
        content.textContent = article.content || article.summary;
        const published = article.publishedAt ? new Date(article.publishedAt) : null;
        document.getElementById('articleDate').textContent = published && !Number.isNaN(published.getTime())
            ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' }).format(published)
            : '';
        const image = document.getElementById('articleImage');
        const categorySlug = article.category.toLocaleLowerCase('pt-BR')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        image.src = article.imageUrl || `img/news-${categorySlug}.svg`;
        image.alt = article.title;
        image.hidden = false;
        image.addEventListener('error', () => {
            if (image.src.endsWith('/img/hero-news.svg')) return;
            image.src = 'img/hero-news.svg';
        }, { once: true });
        if (article.sourceKind === 'rss' && article.sourceUrl) {
            const sourceLink = document.getElementById('articleSource');
            sourceLink.href = article.sourceUrl;
            sourceLink.hidden = false;
        }
        document.getElementById('articleView').hidden = false;
        notice.hidden = true;
    } catch (error) {
        notice.textContent = error.message;
    }
});
