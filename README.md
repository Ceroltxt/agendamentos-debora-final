# Aplika. — Sistema de Agendamento de Espaços Escolares

Projeto acadêmico com frontend estático e backend Node.js integrado (sem dependências externas de `npm`).

## Como rodar localmente

```bash
npm start
```

Acesse: `http://localhost:3000`

### Contas de demonstração (acesso rápido em `login.html`)
- **Dimitri:** `dguerrask@gmail.com` / senha `123456`
- **Ana Carol:** `anacarol.docente@gmail.com` / senha `123456`

### Códigos de escola disponíveis
- **ETEC Antônio Furlan:** `ETEC-AF2026-8392`
- **ETEC Rocha Mendes:** `ETEC-RM2026-1042`

## Arquitetura do Backend

- `server.js` — Servidor HTTP unificado (arquivos estáticos + `/api/*`)
- `backend/db.js` — Persistência em SQLite nativo (`node:sqlite` quando disponível, ex. Node >= 22.5) com fallback automático para `data/db.json` e seed automático a partir de `data/reservations.json`
- `backend/auth.js` — Hash de senhas com `scrypt` + tokens HMAC-SHA256 em cookie `HttpOnly`
- `backend/conflict.js` — Validação de conflitos de horário, recorrências e conflito simultâneo do docente
- `backend/routes.js` — Rotas REST (`/api/health`, `/api/auth/*`, `/api/schools/*`, `/api/reservations/*`, `/api/notices`, `/api/settings`, `/api/leads`)

## Testes automatizados

```bash
npm test
```

## Deploy rápido no Render (gratuito)

1. Suba as alterações para o GitHub (`git add . && git commit -m "backend nodejs" && git push`).
2. Acesse [render.com](https://render.com), clique em **New + → Web Service** e conecte seu repositório.
3. O arquivo `render.yaml` já define **Start Command:** `npm start` e **Health Check:** `/api/health` (sem etapa de build).
4. Em poucos segundos a aplicação estará no ar pronta para a apresentação!
