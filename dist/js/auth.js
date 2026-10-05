document.addEventListener('DOMContentLoaded', async () => {
    const categories = [
        { title: 'Brasil e economia', links: [['Política', 'politica.html'], ['Economia', 'economia.html'], ['Mundo', 'mundo.html']] },
        { title: 'Sociedade e conhecimento', links: [['Ciência', 'ciencia.html'], ['Educação', 'educacao.html'], ['Saúde', 'saude.html'], ['Tecnologia', 'tecnologia.html']] },
        { title: 'Cultura e esportes', links: [['Cultura', 'cultura.html'], ['Esportes', 'esportes.html'], ['Entretenimento', 'entretenimento.html']] }
    ];
    const navMenu = document.querySelector('.nav-menu');
    let accountLink;

    if (navMenu) {
        const hasEditorialNavigation = Boolean(navMenu.querySelector('a[href="categorias.html"]'));
        if (hasEditorialNavigation) {
            for (const item of [...navMenu.querySelectorAll('.nav-item')]) {
                const link = item.querySelector('a[href]');
                if (categories.some(group => group.links.some(([, url]) => url === link?.getAttribute('href')))) {
                    item.remove();
                }
            }

            const dropdownItem = document.createElement('li');
            dropdownItem.className = 'nav-item category-dropdown';
            const dropdownButton = document.createElement('button');
            dropdownButton.className = 'nav-link category-dropdown-toggle';
            dropdownButton.type = 'button';
            dropdownButton.setAttribute('aria-haspopup', 'true');
            dropdownButton.setAttribute('aria-expanded', 'false');
            dropdownButton.textContent = 'Editorias';
            const submenu = document.createElement('div');
            submenu.className = 'category-submenu';
            submenu.setAttribute('aria-label', 'Categorias de notícias');

            for (const group of categories) {
                const groupElement = document.createElement('section');
                groupElement.className = 'category-submenu-group';
                const heading = document.createElement('h2');
                heading.textContent = group.title;
                const links = document.createElement('ul');
                for (const [label, href] of group.links) {
                    const listItem = document.createElement('li');
                    const link = document.createElement('a');
                    link.className = 'category-sublink';
                    link.href = href;
                    link.textContent = label;
                    if (window.location.pathname.endsWith(`/${href}`)) {
                        link.setAttribute('aria-current', 'page');
                        dropdownButton.classList.add('active');
                    }
                    listItem.append(link);
                    links.append(listItem);
                }
                groupElement.append(heading, links);
                submenu.append(groupElement);
            }

            dropdownButton.addEventListener('click', () => {
                const isOpen = dropdownItem.classList.toggle('open');
                dropdownButton.setAttribute('aria-expanded', String(isOpen));
            });
            dropdownItem.append(dropdownButton, submenu);

            const categoryPageLink = [...navMenu.querySelectorAll('a')]
                .find(link => link.getAttribute('href') === 'categorias.html');
            const categoryPageItem = categoryPageLink?.closest('.nav-item');
            if (categoryPageItem) categoryPageItem.after(dropdownItem);
            else navMenu.append(dropdownItem);

            navMenu.addEventListener('click', event => {
                if (!event.target.closest('.category-sublink')) return;
                navMenu.classList.remove('open');
                document.getElementById('hamburgerBtn')?.setAttribute('aria-expanded', 'false');
            });
        }

        accountLink = document.createElement('a');
        accountLink.className = 'account-link';
        accountLink.href = 'auth.html';
        accountLink.textContent = 'Entrar / Cadastro';

        const topBar = document.querySelector('.top-bar .container');
        const themeButton = document.getElementById('themeToggleBtn');
        if (topBar && themeButton) {
            const actions = document.createElement('div');
            actions.className = 'top-actions';
            themeButton.after(actions);
            actions.append(themeButton, accountLink);
        } else {
            const accountItem = document.createElement('li');
            accountItem.className = 'nav-item account-link-item';
            accountItem.append(accountLink);
            navMenu.append(accountItem);
        }
    }

    const categoryMenu = document.querySelector('.category-dropdown');
    if (categoryMenu) {
        document.addEventListener('click', event => {
            if (!categoryMenu.contains(event.target)) {
                categoryMenu.classList.remove('open');
                categoryMenu.querySelector('.category-dropdown-toggle').setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                categoryMenu.classList.remove('open');
                categoryMenu.querySelector('.category-dropdown-toggle').setAttribute('aria-expanded', 'false');
            }
        });
    }

    let staticSite = false;
    try {
        const response = await fetch('site-config.json', { headers: { Accept: 'application/json' } });
        if (response.ok) {
            const config = await response.json();
            staticSite = config.mode === 'static';
        }
    } catch (error) {
        console.error('Não foi possível detectar o modo de publicação PHNews:', error);
    }

    if (staticSite && 'serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js', { scope: './' })
            .catch(error => console.error('Não foi possível ativar o modo offline PHNews:', error));
    }

    if (staticSite) accountLink?.remove();

    if (accountLink && !staticSite) {
        try {
            const response = await fetch('/api/auth/me', { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Falha ao conferir a sessão (${response.status}).`);
            const { user } = await response.json();
            if (user) {
                accountLink.href = 'cms.html';
                accountLink.textContent = user.role === 'admin' ? 'CMS · Administração' : 'CMS · Minhas matérias';
            }
        } catch (error) {
            console.error('Não foi possível atualizar o link da conta PHNews:', error);
        }
    }

    const authForms = document.getElementById('authForms');
    if (!authForms) return;

    const alert = document.getElementById('authAlert');
    for (const form of authForms.querySelectorAll('form')) {
        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(form));
            const endpoint = form.id === 'registerForm' ? '/api/auth/register' : '/api/auth/login';
            const submitButton = form.querySelector('[type="submit"]');
            submitButton.disabled = true;
            alert.hidden = true;

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify(data)
                });
                const result = response.status === 204 ? {} : await response.json();
                if (!response.ok) throw new Error(result.error || 'Não foi possível autenticar sua conta.');
                window.location.assign('cms.html');
            } catch (error) {
                alert.textContent = error.message;
                alert.hidden = false;
            } finally {
                submitButton.disabled = false;
            }
        });
    }
});
