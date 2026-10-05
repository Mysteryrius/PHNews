/* ==========================================================================
   PHNews - Funcionalidades JavaScript Interativas (js/script.js)
   Recursos: Toggle Tema Dark/Light, Menu Hamburger Responsivo, Carrossel de Destaques,
            Filtro de Notícias por Categoria e Validação de Formulário.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

    const currentDate = document.getElementById('currentDate');
    if (currentDate) {
        const formattedDate = new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        }).format(new Date());
        currentDate.textContent = formattedDate.charAt(0).toLocaleUpperCase('pt-BR') + formattedDate.slice(1);
    }

    /* ----------------------------------------------------------------------
       1. Alternador de Tema (Dark / Light Mode) com localStorage
       ---------------------------------------------------------------------- */
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');
    const themeText = document.getElementById('themeText');

    // Recupera preferência salva no localStorage
    const savedTheme = localStorage.getItem('phnews_theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark');
        if (themeText) themeText.textContent = 'Modo Claro';
        if (themeIcon) themeIcon.textContent = '☀️';
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark');
            const isDark = document.body.classList.contains('dark');
            
            localStorage.setItem('phnews_theme', isDark ? 'dark' : 'light');
            if (themeText) themeText.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
            if (themeIcon) themeIcon.textContent = isDark ? '☀️' : '🌙';
        });
    }

    /* ----------------------------------------------------------------------
       2. Menu Hamburger Responsivo (Mobile Navigation)
       ---------------------------------------------------------------------- */
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navMenu = document.getElementById('navMenu');

    if (hamburgerBtn && navMenu) {
        hamburgerBtn.addEventListener('click', () => {
            navMenu.classList.toggle('open');
            const isOpen = navMenu.classList.contains('open');
            hamburgerBtn.setAttribute('aria-expanded', isOpen);
        });

        // Fecha o menu ao clicar em qualquer link
        const navLinks = navMenu.querySelectorAll('.nav-link');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('open');
            });
        });
    }

    /* ----------------------------------------------------------------------
       3. Carrossel de Destaques Automático e Manual
       ---------------------------------------------------------------------- */
    const carouselSlides = document.getElementById('carouselSlides');
    const prevBtn = document.getElementById('prevSlide');
    const nextBtn = document.getElementById('nextSlide');

    if (carouselSlides) {
        const slides = carouselSlides.children;
        let currentSlide = 0;
        const totalSlides = slides.length;
        let autoSlideInterval;

        function updateCarousel() {
            carouselSlides.style.transform = `translateX(-${currentSlide * 100}%)`;
        }

        function nextSlide() {
            currentSlide = (currentSlide + 1) % totalSlides;
            updateCarousel();
        }

        function prevSlide() {
            currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
            updateCarousel();
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextSlide();
                resetAutoSlide();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevSlide();
                resetAutoSlide();
            });
        }

        function startAutoSlide() {
            autoSlideInterval = setInterval(nextSlide, 4500);
        }

        function resetAutoSlide() {
            clearInterval(autoSlideInterval);
            startAutoSlide();
        }

        startAutoSlide();
    }

    /* ----------------------------------------------------------------------
       4. Filtro Dinâmico de Notícias por Categoria
       ---------------------------------------------------------------------- */
    const filterButtons = document.querySelectorAll('.filter-btn');
    const newsCards = document.querySelectorAll('.news-card');

    if (filterButtons.length > 0 && newsCards.length > 0) {
        filterButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                filterButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const selectedCategory = btn.getAttribute('data-category');

                newsCards.forEach(card => {
                    const cardCategory = card.getAttribute('data-category');
                    if (selectedCategory === 'todas' || selectedCategory === cardCategory) {
                        card.style.display = 'flex';
                    } else {
                        card.style.display = 'none';
                    }
                });
            });
        });
    }

    /* ----------------------------------------------------------------------
       5. Validação Interativa do Formulário de Contato
       ---------------------------------------------------------------------- */
    const contactForm = document.getElementById('contactForm');
    const formAlert = document.getElementById('formAlert');

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            let isValid = true;

            const nameInput = document.getElementById('nome');
            const emailInput = document.getElementById('email');
            const subjectInput = document.getElementById('assunto');
            const messageInput = document.getElementById('mensagem');

            // Validação de Nome (não vazio e pelo menos 3 caracteres)
            if (!nameInput.value.trim() || nameInput.value.trim().length < 3) {
                setError(nameInput, 'Por favor, informe seu nome completo (mínimo 3 caracteres).');
                isValid = false;
            } else {
                clearError(nameInput);
            }

            // Validação de E-mail via RegEx
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailInput.value.trim() || !emailRegex.test(emailInput.value.trim())) {
                setError(emailInput, 'Por favor, informe um endereço de e-mail válido.');
                isValid = false;
            } else {
                clearError(emailInput);
            }

            // Validação de Assunto
            if (!subjectInput.value.trim()) {
                setError(subjectInput, 'Por favor, informe o assunto da mensagem.');
                isValid = false;
            } else {
                clearError(subjectInput);
            }

            // Validação de Mensagem (pelo menos 10 caracteres)
            if (!messageInput.value.trim() || messageInput.value.trim().length < 10) {
                setError(messageInput, 'Sua mensagem deve conter pelo menos 10 caracteres.');
                isValid = false;
            } else {
                clearError(messageInput);
            }

            if (isValid) {
                if (formAlert) {
                    formAlert.className = 'form-alert success';
                    formAlert.textContent = 'Mensagem enviada com sucesso! Nossa equipe entrará em contato em breve.';
                }
                contactForm.reset();
                setTimeout(() => {
                    if (formAlert) formAlert.style.display = 'none';
                }, 5000);
            }
        });
    }

    function setError(inputElement, message) {
        const formGroup = inputElement.closest('.form-group');
        if (formGroup) {
            formGroup.classList.add('invalid');
            const errorElement = formGroup.querySelector('.error-msg');
            if (errorElement) {
                errorElement.textContent = message;
            }
        }
    }

    function clearError(inputElement) {
        const formGroup = inputElement.closest('.form-group');
        if (formGroup) {
            formGroup.classList.remove('invalid');
        }
    }
});
