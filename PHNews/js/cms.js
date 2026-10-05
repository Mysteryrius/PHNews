document.addEventListener('DOMContentLoaded', async () => {
    const message = document.getElementById('cmsMessage');
    const myArticles = document.getElementById('myArticles');
    const loadMoreArticlesButton = document.getElementById('loadMoreArticlesBtn');
    const reviewQueue = document.getElementById('reviewQueue');
    const reviewSection = document.getElementById('reviewSection');
    const form = document.getElementById('articleForm');
    const submitButton = document.getElementById('articleSubmit');
    const cancelEditButton = document.getElementById('cancelEditBtn');
    const imageInput = document.getElementById('articleImageInput');
    const imagePreview = document.getElementById('articleImagePreview');
    const selectedImagePreview = document.getElementById('selectedArticleImagePreview');
    const removeImageField = document.getElementById('removeImageField');
    const removeImageCheckbox = document.getElementById('removeArticleImage');
    const formHeading = form.closest('.contact-section').querySelector('h2');
    const formFields = {
        title: form.elements.namedItem('title'),
        summary: form.elements.namedItem('summary'),
        content: form.elements.namedItem('content'),
        category: form.elements.namedItem('category'),
    };
    let user = null;
    let editingArticle = null;
    let articleOffset = 0;
    const articlePageSize = 50;
    let previewObjectUrl = null;

    function showPreview(image, source) {
        image.src = source;
        image.hidden = false;
    }

    function clearSelectedImagePreview() {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
        selectedImagePreview.removeAttribute('src');
        selectedImagePreview.hidden = true;
    }

    async function request(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: { Accept: 'application/json', ...(options.headers || {}) }
        });
        if (response.status === 204) return {};
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) window.location.assign('auth.html');
            throw new Error(data.error || 'Não foi possível concluir a operação.');
        }
        return data;
    }

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.hidden = false;
        message.classList.toggle('form-alert-error', isError);
    }

    function finishEditing() {
        editingArticle = null;
        form.reset();
        imageInput.value = '';
        removeImageField.hidden = true;
        imagePreview.removeAttribute('src');
        imagePreview.hidden = true;
        clearSelectedImagePreview();
        formHeading.textContent = 'Enviar uma notícia para revisão';
        submitButton.textContent = 'Enviar para revisão';
        cancelEditButton.hidden = true;
    }

    function editArticle(article) {
        editingArticle = article;
        formFields.title.value = article.title;
        formFields.summary.value = article.summary;
        formFields.content.value = article.content;
        formFields.category.value = article.category;
        imageInput.value = '';
        removeImageCheckbox.checked = false;
        removeImageField.hidden = !article.imageUrl;
        imagePreview.hidden = !article.imageUrl;
        if (article.imageUrl) imagePreview.src = article.imageUrl;
        clearSelectedImagePreview();
        formHeading.textContent = article.status === 'published'
            ? 'Editar matéria publicada'
            : 'Editar rascunho';
        submitButton.textContent = 'Salvar alterações';
        cancelEditButton.hidden = false;
        message.hidden = true;
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        formFields.title.focus({ preventScroll: true });
    }

    function createArticleCard(article, isAdminReview = false) {
        const card = document.createElement('article');
        card.className = 'cms-article-card';
        const title = document.createElement('h3');
        title.textContent = article.title;
        const details = document.createElement('p');
        const created = new Date(article.createdAt);
        const date = Number.isNaN(created.getTime())
            ? 'data desconhecida'
            : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(created);
        const author = user?.role === 'admin' && article.authorName
            ? `${article.authorName} · `
            : '';
        details.textContent = `${article.category} · ${author}${date} · ${article.status === 'pending' ? 'Aguardando revisão' : article.status === 'published' ? 'Publicada' : 'Não aprovada'}`;
        const summary = document.createElement('p');
        summary.textContent = article.summary;
        card.append(title, details);
        if (article.imageUrl) {
            const image = document.createElement('img');
            image.className = 'cms-article-thumbnail';
            image.src = article.imageUrl;
            image.alt = '';
            image.loading = 'lazy';
            card.append(image);
        }
        card.append(summary);

        if (isAdminReview && article.status === 'pending') {
            const actions = document.createElement('div');
            actions.className = 'cms-article-actions';
            for (const decision of ['publish', 'reject']) {
                const button = document.createElement('button');
                button.className = decision === 'publish' ? 'btn-submit' : 'filter-btn';
                button.type = 'button';
                button.textContent = decision === 'publish' ? 'Aprovar e publicar' : 'Rejeitar';
                button.addEventListener('click', async () => {
                    button.disabled = true;
                    try {
                        await request(`/api/admin/articles/${encodeURIComponent(article.id)}/${decision}`, { method: 'POST' });
                        showMessage(decision === 'publish' ? 'Matéria aprovada e publicada.' : 'Matéria rejeitada.');
                        await loadDashboard();
                    } catch (error) {
                        showMessage(error.message, true);
                        button.disabled = false;
                    }
                });
                actions.append(button);
            }
            card.append(actions);
        } else {
            const actions = document.createElement('div');
            actions.className = 'cms-article-actions';
            const edit = document.createElement('button');
            edit.className = 'filter-btn';
            edit.type = 'button';
            edit.textContent = 'Editar matéria';
            edit.addEventListener('click', () => editArticle(article));
            actions.append(edit);

            if (article.status === 'published') {
                const link = document.createElement('a');
                link.className = 'read-more';
                link.href = `article.html?id=${encodeURIComponent(article.id)}`;
                link.textContent = 'Ver notícia publicada →';
                actions.append(link);
            }

            const remove = document.createElement('button');
            remove.className = 'filter-btn danger-action';
            remove.type = 'button';
            remove.textContent = article.status === 'published' ? 'Excluir notícia publicada' : 'Excluir rascunho';
            remove.addEventListener('click', async () => {
                const confirmation = article.status === 'published'
                    ? 'Excluir esta notícia do site? Esta ação não pode ser desfeita.'
                    : 'Excluir este rascunho? Esta ação não pode ser desfeita.';
                if (!window.confirm(confirmation)) return;
                remove.disabled = true;
                try {
                    await request(`/api/articles/${encodeURIComponent(article.id)}`, { method: 'DELETE' });
                    showMessage(article.status === 'published' ? 'Notícia removida do site.' : 'Rascunho removido.');
                    await loadDashboard();
                } catch (error) {
                    showMessage(error.message, true);
                    remove.disabled = false;
                }
            });
            actions.append(remove);
            card.append(actions);
        }
        return card;
    }

    async function loadDashboard(loadMore = false) {
        const offset = loadMore ? articleOffset : 0;
        const mine = await request(`/api/articles/mine?limit=${articlePageSize}&offset=${offset}`);
        if (!loadMore) {
            myArticles.replaceChildren();
            articleOffset = 0;
        }
        myArticles.append(...mine.articles.map(article => createArticleCard(article)));
        articleOffset += mine.articles.length;
        loadMoreArticlesButton.hidden = mine.articles.length < articlePageSize;
        if (articleOffset === 0) {
            myArticles.textContent = user.role === 'admin'
                ? 'Ainda não há matérias editoriais publicadas ou enviadas para revisão.'
                : 'Você ainda não enviou nenhuma matéria para revisão.';
        }

        if (reviewSection.hidden) return;
        const queue = await request('/api/admin/articles/pending');
        reviewQueue.replaceChildren(...queue.articles.map(article => createArticleCard(article, true)));
        if (queue.articles.length === 0) {
            reviewQueue.textContent = 'Nenhuma matéria aguardando aprovação.';
        }
    }

    try {
        const session = await request('/api/auth/me');
        user = session.user;
        if (!user) {
            window.location.assign('auth.html');
            return;
        }
        document.getElementById('cmsWelcome').textContent = `Olá, ${user.name}.`;
        if (user.role === 'admin') {
            reviewSection.hidden = false;
            document.getElementById('cmsRole').textContent = 'Administrador: edite ou exclua qualquer matéria da redação; revise também os rascunhos aguardando publicação.';
            document.getElementById('myArticlesHeading').textContent = 'Todas as matérias editoriais';
        } else {
            document.getElementById('cmsRole').textContent = 'Você pode editar ou excluir suas notícias publicadas. Os novos rascunhos enviados ficam aguardando revisão da redação.';
        }
        await loadDashboard();
    } catch (error) {
        if (error.message !== 'Faça login para continuar.' && error.message !== 'Sua sessão expirou. Faça login novamente.') {
            showMessage(error.message, true);
        }
        return;
    }

    cancelEditButton.addEventListener('click', finishEditing);
    imageInput.addEventListener('change', () => {
        clearSelectedImagePreview();
        const file = imageInput.files?.[0];
        if (!file) {
            imagePreview.hidden = !editingArticle?.imageUrl || removeImageCheckbox.checked;
            return;
        }
        imagePreview.hidden = true;
        previewObjectUrl = URL.createObjectURL(file);
        showPreview(selectedImagePreview, previewObjectUrl);
    });
    removeImageCheckbox.addEventListener('change', () => {
        if (removeImageCheckbox.checked) {
            imagePreview.hidden = true;
            imageInput.value = '';
            clearSelectedImagePreview();
        } else if (editingArticle?.imageUrl) {
            imagePreview.hidden = false;
        }
    });
    loadMoreArticlesButton.addEventListener('click', async () => {
        loadMoreArticlesButton.disabled = true;
        try {
            await loadDashboard(true);
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            loadMoreArticlesButton.disabled = false;
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        submitButton.disabled = true;
        message.hidden = true;
        const data = new FormData(form);
        const wasEditing = Boolean(editingArticle);
        const path = wasEditing
            ? `/api/articles/${encodeURIComponent(editingArticle.id)}`
            : '/api/articles';
        try {
            await request(path, {
                method: wasEditing ? 'PUT' : 'POST',
                body: data
            });
            finishEditing();
            showMessage(wasEditing
                ? 'Alterações da notícia salvas e publicadas.'
                : 'Matéria enviada para revisão da redação.');
            await loadDashboard();
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            submitButton.disabled = false;
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            await request('/api/auth/logout', { method: 'POST' });
            window.location.assign('index.html');
        } catch (error) {
            showMessage(error.message, true);
        }
    });
});
