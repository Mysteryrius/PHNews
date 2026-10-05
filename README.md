# PHNews

Portal de notícias responsivo em português, com dez editorias, fontes RSS identificadas, imagens de capa, experiência de leitura offline e um CMS editorial opcional.

## Acessar o site público

O PHNews tem duas formas de publicação:

- **GitHub Pages (demonstração pública):** site estático, gratuito e independente do computador, Docker e banco de dados do autor. Depois de habilitar o Pages, o workflow deste repositório publica em <https://mysteryrius.github.io/PHNews/>. As notícias são atualizadas automaticamente aproximadamente a cada hora.
- **Docker (aplicação completa):** executa o backend, banco PostgreSQL, cadastro de autores e painel CMS. Para que outras pessoas acessem quando seu computador estiver desligado, essa versão precisaria ser hospedada em um servidor que permaneça ligado.

A demonstração pública do GitHub não precisa acessar o PostgreSQL: uma tarefa automática busca os feeds RSS e inclui no site uma cópia independente das notícias das dez categorias. Ela é somente para leitura; login, cadastro e publicação pelo CMS dependem do backend Docker.

### Ativar a publicação no GitHub Pages

1. Abra **Settings → Pages** no repositório e selecione **GitHub Actions** como origem de publicação.
2. Mantenha os arquivos do workflow na branch `main` e envie as alterações para o GitHub.
3. Em **Actions**, acompanhe a execução **Publicar site PHNews**. Após uma execução concluída, abra <https://mysteryrius.github.io/PHNews/>.
4. Para manter o repositório público e permitir que o professor abra o site, confira a visibilidade do repositório e compartilhe o endereço publicado (ou o próprio endereço do repositório).

O workflow recompõe a cópia RSS em cada publicação e a atualiza em execuções agendadas. A agenda é uma solicitação ao GitHub Actions e pode sofrer atrasos; não é uma garantia de atualização ao minuto.

### Leitura sem conexão

Abra e carregue o site ao menos uma vez enquanto estiver conectado à Internet. O modo offline guarda as páginas de notícias, a última cópia RSS e até 80 imagens recentemente abertas no cache do navegador. Depois disso, as páginas e notícias salvas podem ser lidas sem conexão nesse mesmo navegador/dispositivo. A cópia guardada não recebe notícias novas enquanto estiver offline; ela se atualiza quando a rede volta e a hospedagem publica uma nova versão.

O modo offline não permite login, cadastro, CMS nem acesso a notícias que não tenham sido salvas. Navegar pelo arquivo local em `file://` não instala o cache offline; use o site HTTPS ou um servidor web.

## Rodar a aplicação completa com Docker

É necessário instalar o Docker Desktop.

1. Entre na pasta da aplicação e crie o arquivo de configuração local:

   ```powershell
   Set-Location PHNews
   Copy-Item .env.example .env
   ```

2. Edite `.env` com segredos exclusivos. `ADMIN_PASSWORD` deve ter pelo menos 12 caracteres e `JWT_SECRET` pelo menos 32. Não compartilhe nem versione esse arquivo.
3. Inicie a aplicação:

   ```powershell
   docker compose up --build -d
   ```

4. Acesse <http://localhost:3000>. Verifique a API em <http://localhost:3000/api/health>. O login administrativo fica em <http://localhost:3000/auth.html>, usando `ADMIN_EMAIL` e `ADMIN_PASSWORD` definidos em `.env`.

As notícias são sincronizadas com feeds públicos da Agência Brasil e de busca do Google Notícias para dez categorias. A aplicação Docker atualiza os feeds a cada cinco minutos por padrão; as páginas tentam atualizar a lista a cada dois minutos. Altere `NEWS_FEED_URL` e `NEWS_REFRESH_MINUTES` em `.env` se necessário.

### Contas, editoria e imagens

- Leitores cadastram contas de autor pela página **Entrar / Cadastro**. Novas matérias enviadas aguardam aprovação do administrador.
- Autores podem editar ou excluir as próprias matérias editoriais. Administradores podem aprovar, editar ou excluir matérias de qualquer autor.
- O CMS aceita capas JPEG ou PNG de até 5 MB. Os uploads ficam no volume persistente Docker `phnews-uploads`.
- Quando o RSS fornece uma foto, o PHNews exibe essa imagem e atribui a publicação. Se não fornece, o cartão usa a ilustração da categoria. Os links de notícias RSS levam à fonte original; o PHNews não republica o texto integral de terceiros.
- As senhas usam hash bcrypt. Os cookies de sessão são HTTP-only e expiram em oito horas.

### Dados e comandos Docker

- `phnews-data` armazena contas e notícias; `phnews-uploads` armazena capas enviadas. Ambos são volumes persistentes.
- `docker compose logs -f app` acompanha os logs; `docker compose down` para os serviços sem apagar os dados.
- **Não execute `docker compose down -v` se quiser preservar o banco e as capas.** Inclua os dois volumes em qualquer rotina de backup.
- Nunca exponha a porta do PostgreSQL à Internet. Para hospedar o CMS publicamente, use HTTPS e configure `COOKIE_SECURE=true`.

## Atualizar o site manualmente

Uma publicação com os feeds disponíveis pode ser gerada no GitHub Actions por um `push` para `main` ou manualmente em **Actions → Publicar site PHNews → Run workflow**. Para gerar os arquivos localmente:

```sh
cd PHNews
npm ci
npm run build:pages
```

O site estático pronto fica em `PHNews/dist/`. A geração acessa os RSS públicos e não precisa da API nem do PostgreSQL. Preserve o artefato gerado junto com o restante dos arquivos apenas se desejar; o GitHub Pages o constrói automaticamente em cada publicação.

## Testes e manutenção

Na pasta `PHNews`, execute:

```sh
npm ci
npm test
npm audit --omit=dev
```

Dependabot verifica semanalmente atualizações de dependências Node.js, Docker e GitHub Actions e abre pull requests para revisão. Revise e teste essas atualizações antes de aceitá-las.

## Domínio, HTTPS e WAF

O domínio `phnews.com.br` precisa ser registrado e controlado pelo responsável pelo projeto. Ele **não está incluído nem configurado automaticamente**. Um site hospedado no GitHub Pages pode oferecer HTTPS no endereço `github.io` sem um servidor ligado em casa.

Para usar um domínio próprio com proteção de borda:

1. Registre o domínio e controle seu DNS. Cloudflare pode ser o provedor de DNS/proxy/WAF, se o titular optar por ele.
2. Configure o domínio personalizado no **Settings → Pages** e crie no provedor DNS os registros que o GitHub Pages indicar para esse domínio. Não ative o proxy antes de validar os registros e o domínio.
3. Aguarde a emissão do certificado gerenciado pelo GitHub Pages e habilite **Enforce HTTPS**. Confirme o cadeado antes de compartilhar o endereço personalizado.
4. Se usar o proxy Cloudflare, configure SSL/TLS em **Full (strict)** e mantenha apenas tráfego HTTP/HTTPS encaminhado ao GitHub Pages. Ative as regras de segurança e proteção disponíveis no plano Cloudflare e teste o site após a mudança.

O DNS, o certificado e o WAF não são instalados pelo Docker nem por este repositório: exigem controle do domínio, acesso às configurações do registrador/DNS e aprovação das definições do GitHub Pages. O WAF protege o tráfego que passa pelo proxy, não o site se o visitante contornar esse proxy. A demonstração estática não executa o backend de autenticação/CMS.

## Estrutura

```text
.github/workflows/pages.yml    publicação e atualização RSS agendada
.github/dependabot.yml         atualizações semanais de dependências
PHNews/                        site, backend Docker, RSS e construtor estático
README.md                      documentação deste repositório
```
