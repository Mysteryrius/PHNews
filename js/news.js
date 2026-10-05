document.addEventListener('DOMContentLoaded', () => {
    const grid = document.querySelector('main .news-grid');
    if (!grid) return;
    grid.replaceChildren();

    const status = document.createElement('div');
    status.className = 'news-feed-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const statusText = document.createElement('span');
    const controls = document.createElement('div');
    controls.className = 'news-feed-controls';
    const refreshButton = document.createElement('button');
    refreshButton.className = 'filter-btn';
    refreshButton.type = 'button';
    refreshButton.textContent = 'Atualizar notícias';
    const loadMoreButton = document.createElement('button');
    loadMoreButton.className = 'filter-btn';
    loadMoreButton.type = 'button';
    loadMoreButton.textContent = 'Carregar mais notícias';
    loadMoreButton.hidden = true;
    controls.append(refreshButton, loadMoreButton);
    status.append(statusText, controls);
    grid.before(status);

    const filters = [...document.querySelectorAll('.filter-btn[data-category]')];
    const categoryHeading = document.querySelector('main .section-title')?.textContent.trim() || '';
    const pageCategory = categoryHeading.startsWith('Categoria:')
        ? categoryHeading.slice('Categoria:'.length).trim()
        : '';
    const initialCategory = pageCategory || filters.find(button => button.classList.contains('active'))?.dataset.category;
    let currentCategory = initialCategory === 'todas' ? '' : (initialCategory || '');
    let currentOffset = 0;
    let isLoading = false;
    const pageSize = 24;
    let offlineSnapshot = null;

    function categoryId(name) {
        return name.toLocaleLowerCase('pt-BR')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    function articleCard(article) {
        const card = document.createElement('article');
        card.className = 'news-card';
        card.dataset.category = categoryId(article.category);
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'card-img-wrapper';
        const image = document.createElement('img');
        image.src = article.imageUrl || `img/news-${categoryId(article.category)}.svg`;
        image.alt = article.title;
        image.loading = 'lazy';
        image.addEventListener('error', () => {
            if (image.src.endsWith('/img/hero-news.svg')) return;
            image.src = 'img/hero-news.svg';
        }, { once: true });

        const tag = document.createElement('span');
        tag.className = 'category-tag';
        tag.textContent = article.category;
        imageWrapper.append(image, tag);

        const content = document.createElement('div');
        content.className = 'card-content';
        const meta = document.createElement('div');
        meta.className = 'card-meta';
        const date = article.publishedAt ? new Date(article.publishedAt) : null;
        const published = date && !Number.isNaN(date.getTime())
            ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
            : 'Recém-publicada';
        meta.textContent = `${published} · ${article.sourceName || 'Redação PHNews'}`;

        const title = document.createElement('h3');
        title.className = 'card-title';
        const titleLink = document.createElement('a');
        titleLink.textContent = article.title;
        const external = article.sourceKind === 'rss';
        titleLink.href = external ? article.sourceUrl : `article.html?id=${encodeURIComponent(article.id)}`;
        if (external) {
            titleLink.target = '_blank';
            titleLink.rel = 'noopener noreferrer';
        }
        title.append(titleLink);

        const excerpt = document.createElement('p');
        excerpt.className = 'card-excerpt';
        excerpt.textContent = article.summary;

        const readMore = document.createElement('a');
        readMore.className = 'read-more';
        readMore.textContent = external ? 'Ler na fonte original →' : 'Ler matéria completa →';
        readMore.href = external ? article.sourceUrl : `article.html?id=${encodeURIComponent(article.id)}`;
        if (external) {
            readMore.target = '_blank';
            readMore.rel = 'noopener noreferrer';
        }

        content.append(meta, title, excerpt, readMore);
        card.append(imageWrapper, content);
        return card;
    }

    async function loadNews(reset = true) {
        if (isLoading) return;
        isLoading = true;
        refreshButton.disabled = true;
        loadMoreButton.disabled = true;
        statusText.textContent = 'Buscando notícias atualizadas…';
        const params = new URLSearchParams({
            limit: String(pageSize),
            offset: String(reset ? 0 : currentOffset)
        });
        if (currentCategory && currentCategory !== 'todas') params.set('category', currentCategory);

        try {
            let data;
            try {
                const response = await fetch(`/api/news?${params}`, { headers: { Accept: 'application/json' } });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'A API de notícias não está disponível.');
                data = result;
            } catch (apiError) {
                if (!offlineSnapshot) {
                    const response = await fetch('news.json', { headers: { Accept: 'application/json' } });
                    if (!response.ok) {
                        throw new Error('Não foi possível carregar a API nem a cópia estática das notícias.');
                    }
                    offlineSnapshot = await response.json();
                    if (!Array.isArray(offlineSnapshot.articles)) {
                        throw new Error('A cópia estática de notícias está em formato inválido.');
                    }
                }
                const matches = offlineSnapshot.articles.filter(article =>
                    !currentCategory || article.category === currentCategory
                );
                data = {
                    articles: matches.slice(reset ? 0 : currentOffset, (reset ? 0 : currentOffset) + pageSize),
                    newsUpdatedAt: offlineSnapshot.updatedAt,
                    offlineSnapshot: true
                };
                console.info('Exibindo a cópia estática das notícias porque a API não está disponível.', apiError);
            }
            if (reset) {
                grid.replaceChildren();
                currentOffset = 0;
            }
            grid.append(...data.articles.map(articleCard));
            currentOffset += data.articles.length;
            const updated = data.newsUpdatedAt ? new Date(data.newsUpdatedAt) : null;
            const updatedText = updated && !Number.isNaN(updated.getTime())
                ? new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(updated)
                : 'aguardando a primeira sincronização';
            statusText.textContent = data.offlineSnapshot
                ? `${currentOffset} notícia(s) carregada(s) · cópia independente do banco, atualizada em ${updatedText}.`
                : `${currentOffset} notícia(s) carregada(s) · feeds atualizados às ${updatedText}.`;
            loadMoreButton.hidden = data.articles.length < pageSize;
            if (currentOffset === 0) {
                const empty = document.createElement('p');
                empty.className = 'news-empty-state';
                empty.textContent = 'Ainda não há notícias publicadas nesta categoria.';
                grid.append(empty);
            }
        } catch (error) {
            statusText.textContent = `${error.message} Verifique se a aplicação está em execução.`;
        } finally {
            isLoading = false;
            refreshButton.disabled = false;
            loadMoreButton.disabled = false;
        }
    }

    for (const filter of filters) {
        filter.addEventListener('click', () => {
            filters.forEach(button => button.classList.toggle('active', button === filter));
            currentCategory = filter.dataset.category === 'todas'
                ? ''
                : filter.dataset.categoryName || filter.textContent.replace(/^\d+\.\s*/, '').trim();
            loadNews();
        });
    }

    refreshButton.addEventListener('click', () => loadNews());
    loadMoreButton.addEventListener('click', () => loadNews(false));
    loadNews();
    window.setInterval(() => loadNews(), 120_000);
});
