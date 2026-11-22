# Controle de Gastos (APK Android)

App Android com **login, cadastro de conta, CRUD de gastos e relatório mensal**.
Banco **SQLite** de verdade (dentro do celular, sem servidor, sem XAMPP) e telas em HTML/CSS/JS dentro de um WebView.
Funciona 100% offline e não pede nenhuma permissão.

## Como gerar o APK (sem Android Studio)

1. Crie um repositório no GitHub e envie **todo o conteúdo desta pasta** (inclusive a pasta oculta `.github`):
   ```bash
   git init && git add . && git commit -m "Controle de Gastos"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/controle-gastos.git
   git push -u origin main
   ```
2. No GitHub, abra a aba **Actions**. O fluxo **Gerar APK** roda sozinho (uns 3 a 5 minutos). Se não rodar, clique em **Run workflow**.
3. Quando terminar, abra a execução e baixe **controle-gastos-apk** em *Artifacts*. Dentro do zip está o `app-debug.apk`.
4. Instale no celular (permita "instalar apps desconhecidos" para o navegador/gerenciador de arquivos).

Com Android Studio: **File > Open** nesta pasta e **Build > Build APK(s)**.

## Testar sem compilar (versão site)

Abra `app/src/main/assets/www/index.html` por um servidor local ou hospede a pasta `www` (GitHub Pages).
No navegador os dados ficam no `localStorage` (`js/mock.js`), com as mesmas telas e regras.

## Estrutura

| Arquivo | Função |
|---|---|
| `app/src/main/assets/www/index.html` | Telas: entrar, criar conta, início, novo/editar gasto, gastos, relatório |
| `app/src/main/assets/www/js/app.js` | Navegação e lógica das telas |
| `app/src/main/java/.../Banco.java` | SQLite, login, CRUD e relatório |
| `app/src/main/java/.../MainActivity.java` | WebView e botão voltar |
| `.github/workflows/apk.yml` | Compila o APK na nuvem |

## Banco de dados (criado automaticamente na primeira abertura)

```sql
usuarios (id, nome, email UNIQUE, senha_hash, criado_em)
gastos   (id, usuario_id -> usuarios, descricao, valor_centavos, categoria, data, criado_em)
```

- Senha de login: hash **PBKDF2-SHA256 com sal** (nunca em texto puro).
- Valores em **centavos** (inteiro), sem erro de arredondamento.
- Cada usuário só enxerga e altera os próprios gastos (`WHERE usuario_id = ?`) e todas as consultas usam parâmetros (`?`).

## Como testar cada parte

| Parte | Como testar |
|---|---|
| Conta | **Criar conta** (já entra logado), **Sair**, **Entrar** de novo. Crie uma 2ª conta: ela não vê os gastos da 1ª. |
| Create | Aba **Novo**, preencha e salve. Tente salvar vazio ou valor 0: aparece erro. |
| Read | Aba **Gastos** lista o mês; use ‹ › para trocar de mês. |
| Update | Em **Gastos**, **Editar**, altere e salve. |
| Delete | Em **Gastos**, **Excluir** (toque duas vezes para confirmar). |
| Relatório | Aba **Relatório**: dados da conta, total do mês, comparação com o mês anterior, maior gasto, média, barras por categoria e todos os lançamentos. Cadastre, edite ou exclua e os números mudam. |
