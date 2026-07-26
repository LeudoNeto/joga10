# ⚽ Joga10

Plataforma de organização e gestão de grupos esportivos (peladas): múltiplos
grupos, papéis por grupo, cadastro/importação de jogadores com nota de
habilidade e sorteio inteligente de times (aleatório ou balanceado pelas notas).

> **Escopo desta entrega:** funcionalidades até a **formação dos times**
> (RF01–RF06 / RN01–RN04). O registro de partidas e estatísticas por partida
> (RF07, RF08, RN05) não faz parte desta parte do trabalho — as respectivas
> tabelas existem no modelo de dados, mas sem implementação de API/telas.

- **Front-end:** React + TypeScript + Tailwind (build servido por nginx alpine)
- **Back-end:** FastAPI (Python 3.12)
- **Banco de dados:** MySQL 8

---

## 🚀 Como rodar (Docker Compose)

Pré-requisitos: Docker + Docker Compose.

```bash
# 1. (opcional) configure variáveis de ambiente
cp .env.example .env

# 2. suba tudo (banco, back-end e front-end)
docker compose up --build
```

Serviços expostos:

| Serviço   | URL                              | Descrição                          |
| --------- | -------------------------------- | ---------------------------------- |
| Front-end | http://localhost:8080            | Aplicação React (nginx)            |
| Back-end  | http://localhost:8000            | API FastAPI                        |
| API Docs  | http://localhost:8000/docs       | Swagger UI (OpenAPI)               |
| MySQL     | localhost:3306                   | Banco (usuário/senha: `joga10`)    |

O nginx do front-end faz proxy de `/api` para o back-end, então basta acessar
**http://localhost:8080**.

### Dados de demonstração (opcional)

Cria um usuário admin, um grupo e alguns jogadores:

```bash
docker compose exec backend python -m app.seed
# Login: admin@joga10.dev  |  Senha: joga10123
```

---

## 🧑‍💻 Desenvolvimento local (sem Docker)

**Back-end**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
# aponte para um MySQL acessível:
export DATABASE_URL="mysql+pymysql://joga10:joga10@localhost:3306/joga10"
uvicorn app.main:app --reload
```

**Front-end**

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxy /api -> http://localhost:8000)
```

---

## 🗂️ Estrutura

```
joga10/
├── docker-compose.yml        # db + backend + frontend
├── .env.example
├── backend/                  # FastAPI
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py           # app + inclusão de routers (/api)
│       ├── config.py         # settings (env)
│       ├── database.py       # engine/session
│       ├── models.py         # SQLAlchemy (User, Group, Player, Event, Team, Match...)
│       ├── schemas.py        # Pydantic
│       ├── security.py       # hash de senha + JWT
│       ├── deps.py           # guardas de permissão (membro/admin por grupo)
│       ├── seed.py           # dados de demonstração
│       ├── routers/          # auth, groups, invites, players, events, teams
│       └── services/         # draw.py (sorteio), import_players.py (importação)
└── frontend/                 # React + TS + Tailwind
    ├── Dockerfile            # build (node) -> nginx:alpine
    ├── nginx.conf            # SPA fallback + proxy /api
    └── src/
        ├── api/client.ts     # wrapper fetch + JWT
        ├── auth/             # AuthContext
        ├── components/       # UI kit, layout, rota protegida
        └── pages/            # login, signup, grupos, grupo (tabs), evento, join
```

---

## 🔐 Modelo de permissões

- **Usuário Registrado:** qualquer conta (login/signup). Não é necessariamente
  um jogador (RN01 — usuário e jogador são desacoplados).
- **Membro do Grupo:** acesso somente leitura dentro do grupo.
- **Admin do Grupo:** criador do grupo ou convidado como admin; pode escrever.
- **Jogador:** entidade lógica do grupo, sem login, gerenciada pelos admins.

O papel é **por grupo** (RN02): o mesmo usuário pode ser admin no Grupo A e
membro no Grupo B. Toda escrita é validada no back-end pelas dependências
`require_group_admin` / `require_event_admin` (RN03).

---

## ✅ Rastreabilidade de requisitos

| Requisito | Onde                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| RF01 Autenticação        | `routers/auth.py` (signup/login/me), `security.py`, front `auth/`          |
| RF02 Gestão de grupos    | `routers/groups.py`, front `pages/GroupsPage.tsx`, `GroupPage.tsx`         |
| RF03 Convites por link   | `routers/invites.py`, front `group/InvitesTab.tsx`, `pages/JoinPage.tsx`   |
| RF04 Cadastro de jogadores | `routers/players.py` (+ importação), front `group/PlayersTab.tsx`        |
| RF05 Gestão de eventos   | `routers/events.py`, front `group/EventsTab.tsx`                           |
| RF06 Sorteio de times    | `services/draw.py`, `routers/teams.py`, front `EventPage.tsx` (DrawControls) |
| RN01 Usuário ≠ Jogador   | `User` × `Player` são tabelas independentes                                |
| RN02 Escopo de papel     | `GroupMembership.role` por grupo                                           |
| RN03 Controle de edição  | guardas em `deps.py`                                                       |
| RN04 Balanceamento       | `services/draw.py::draw_balanced` (greedy por menor soma, tamanhos iguais) |

> RF07 (registro de partidas), RF08 (próximo jogo) e RN05 (rotação de times)
> ficaram fora desta entrega.

---

## 🧠 Algoritmos

**Sorteio balanceado (RN04):** ordena os jogadores por nota (desc.) e atribui
cada um ao time de menor soma acumulada, respeitando um limite de tamanho
(`ceil(n/num_times)`) para manter as equipes com o mesmo número de jogadores.
Resultado: somas/médias das notas o mais próximas possível.

---

## 📥 Importação de jogadores (RF04)

Na aba **Jogadores** de um grupo, o admin pode clicar em **Importar** e escolher:

- **Colar texto** — uma linha por jogador no formato `Nome - Nota`
  (aceita vírgula ou ponto na nota; linha só com nome usa nota padrão 5).
- **Arquivo `.txt`** — mesmo formato do texto colado.
- **Arquivo `.csv`** — colunas `Nome`, `Nota` e `Posição` (opcional);
  detecta separador `,` ou `;` e cabeçalho automaticamente.
- **Planilha `.xls` / `.xlsx`** — mesmas colunas do CSV (primeira aba).

O back-end (`services/import_players.py`) faz o parse e devolve uma
**pré-visualização** (`POST /groups/{id}/players/import`): notas fora de 0–10 são
ajustadas, linhas sem nome são sinalizadas e ignoradas. O usuário confere a
tabela e confirma, gravando o lote via `POST /groups/{id}/players/bulk`.

Exemplo de texto:

```
Ronaldo - 9.5
Zico - 9
Cafu - 8
Dida - 7,5
```

## 🌐 Principais endpoints (prefixo `/api`)

```
POST   /auth/signup | /auth/login            GET /auth/me
GET    /groups | POST /groups                GET/PATCH/DELETE /groups/{id}
POST   /groups/{id}/invites                  GET /invites/{token}  POST /invites/{token}/accept
GET/POST /groups/{id}/players                PUT/DELETE /groups/{id}/players/{pid}
POST   /groups/{id}/players/import           POST /groups/{id}/players/bulk
GET/POST /groups/{id}/events                 GET/PATCH/DELETE /events/{eid}
GET    /events/{eid}/teams                   POST /events/{eid}/draw   DELETE /events/{eid}/teams
```
