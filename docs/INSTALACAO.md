# Instalação no computador da loja

O sistema roda **100% local** (sem internet no dia a dia), num único computador Windows.

## O que precisa instalar na loja

Só **uma** coisa: o **Node.js** (o motor que roda o sistema).

1. No computador da loja, baixe o Node.js **versão LTS** em: https://nodejs.org
2. Instale (avançar → avançar → concluir). Isso só é feito **uma vez**.
   - Se o Windows (Smart App Control) reclamar do instalador, é só permitir — o instalador do Node é assinado e confiável.

> Não precisa instalar mais nada (nem banco de dados, nem servidor). O banco é um único arquivo e já vem embutido.

## Como levar o sistema para a loja

Há dois pacotes `.zip` prontos (na Área de Trabalho de quem montou):

- **`Fechamento-completo (offline).zip`** (~26 MB) — já vem com tudo. Use se a loja **não tem internet**.
- **`Fechamento-instalar (leve).zip`** (~0,4 MB) — bem pequeno. Use se a loja **tem internet** (na 1ª vez ele baixa o resto sozinho).

### Sem pendrive? Manda pela internet

Qualquer um destes funciona — escolha o que for mais fácil pra você:

- **WhatsApp**: mande o `.zip` para você mesmo (ou "Conversa com você mesmo").
  Os 26 MB do pacote completo cabem tranquilo. Na loja, abra o **WhatsApp Web**
  no navegador e baixe o arquivo.
- **E-mail**: envie o `.zip` em anexo para o seu e-mail e baixe na loja. (Gmail
  aceita até 25 MB por anexo — para o pacote completo, prefira o Google Drive.)
- **Google Drive / OneDrive**: suba o `.zip`, abra o site na loja e baixe.
- **Telegram**: mande para "Mensagens salvas" e baixe na loja.

### Depois de baixar na loja

1. **Descompacte** o `.zip` (botão direito → "Extrair tudo") para uma pasta, por exemplo `C:\Fechamento_Alface`.
2. Dê dois cliques em **`criar-atalho.bat`** → cria o atalho **"Fechamento de Caixa"** na Área de Trabalho (com o ícone da logo).
3. Pronto. Use o atalho para abrir o sistema.

> Lembrete: o Node.js (acima) precisa estar instalado na loja **antes** de abrir o sistema.

## Usando no dia a dia

- Abra pelo atalho **"Fechamento de Caixa"** (ou pelo `iniciar.bat`).
- Abre uma janela preta (o servidor) e o navegador no sistema. **Não feche a janela preta** enquanto estiver usando — ela é o servidor.
- Para encerrar no fim do dia, feche a janela preta.
- No primeiro acesso, crie o **operador** (usuário e senha) na tela de login.

## Backup (importante)

Todos os dados ficam em **um único arquivo**:

```
server\data\fechamento.db
```

Para fazer backup, basta **copiar esse arquivo** (para um pendrive, nuvem, etc.).
Para restaurar, é só colocar o arquivo de volta no mesmo lugar. Faça isso de vez
em quando — é a segurança dos seus fechamentos.

## Atualizar o sistema (quando houver mudanças)

1. Copie os arquivos novos por cima (menos a pasta `server\data`, para não perder os dados).
2. Se o código do site mudou, gere a interface de novo: abra o `iniciar.bat`
   após apagar a pasta `dist`, ou rode `npm run build` na pasta do projeto.

## Resolução de problemas

- **"node não é reconhecido"** ao abrir: o Node.js não está instalado (ou o PC precisa ser reiniciado após instalar).
- **Navegador abre com erro de conexão**: aguarde 2–3 segundos e atualize (F5) — o servidor pode estar terminando de subir.
- **Esqueci a senha do operador**: como é um sistema local simples, dá para criar
  outro operador (se houver acesso) ou apagar o `fechamento.db` para começar do
  zero (isso apaga os fechamentos — faça backup antes).
