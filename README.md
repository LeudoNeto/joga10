# ⚽ Joga10

Plataforma de organização e gestão de grupos esportivos (peladas): múltiplos
grupos, papéis por grupo, cadastro/importação de jogadores com nota e foto,
sorteio de times (Ótimo, Heurístico ou Aleatório, com panelinhas), registro das
partidas com gols e assistências, rodízio de times e ranking de jogadores.

- **Front-end:** React + TypeScript + Tailwind, ícones [lucide](https://lucide.dev),
  tema escuro por padrão (alternável para o claro no cabeçalho). Build servido
  por nginx alpine.
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

### Atualizando uma instalação existente

Basta `docker compose up --build`: na inicialização o back-end cria as tabelas
novas e aplica as migrações pendentes (`app/migrations.py` — colunas novas,
papel `moderator` no ENUM do MySQL, etc.). As migrações são idempotentes e não
apagam dados.

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
pip install -r requirements-dev.txt
# aponte para um MySQL acessível:
export DATABASE_URL="mysql+pymysql://joga10:joga10@localhost:3306/joga10"
uvicorn app.main:app --reload
pytest                                             # testes (SQLite em memória)
```

**Front-end**

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (proxy /api -> http://localhost:8000)
npm test             # testes do balanceamento (vitest)
```

---

## 🗂️ Estrutura

```
joga10/
├── docker-compose.yml        # db + backend + frontend
├── .env.example
├── backend/                  # FastAPI
│   ├── Dockerfile
│   ├── requirements.txt      # (+ requirements-dev.txt para os testes)
│   ├── tests/                # pytest
│   └── app/
│       ├── main.py           # app + inclusão de routers (/api)
│       ├── config.py         # settings (env)
│       ├── database.py       # engine/session
│       ├── migrations.py     # upgrades idempotentes do schema
│       ├── models.py         # SQLAlchemy (User, Group, Player, Event, Team, Match...)
│       ├── schemas.py        # Pydantic
│       ├── security.py       # hash de senha + JWT
│       ├── deps.py           # guardas de permissão (membro/moderador/admin)
│       ├── seed.py           # dados de demonstração
│       ├── routers/          # auth, groups, invites, players, photos, events,
│       │                     # teams, matches, stats
│       └── services/         # import_players, name_match, photos, rotation,
│                             # ranking, event_state
└── frontend/                 # React + TS + Tailwind
    ├── Dockerfile            # build (node) -> nginx:alpine
    ├── nginx.conf            # SPA fallback + proxy /api
    └── src/
        ├── api/client.ts     # wrapper fetch + JWT
        ├── auth/, theme/     # AuthContext, ThemeContext (escuro/claro)
        ├── components/       # UI kit, layout, toasts/confirmação, exportação
        ├── lib/              # balance.ts (+ worker), draw.ts, exportação
        │                     # texto/imagem, formatação
        └── pages/            # login, signup, grupos, grupo (tabs), evento
                              # (times, partidas, estatísticas), join
```

---

## 🔐 Modelo de permissões

- **Usuário Registrado:** qualquer conta (login/signup). Não é necessariamente
  um jogador (RN01 — usuário e jogador são desacoplados).
- **Membro do Grupo:** acesso somente leitura dentro do grupo.
- **Moderador do Grupo:** membro que também registra gols e assistências da
  partida atual, conduz as partidas (inicia, finaliza, reabre, cancela) e altera
  **foto e posição** dos jogadores (na aba Estatísticas do evento).
- **Admin do Grupo:** criador do grupo ou convidado como admin; pode tudo.
  Também promove membros a moderador/admin na aba **Membros** (o papel do
  criador não pode ser alterado).
- **Jogador:** entidade lógica do grupo, sem login, gerenciada pelos admins.

O papel é **por grupo** (RN02). Toda escrita é validada no back-end pelas
dependências `require_group_admin` / `require_group_staff` /
`require_event_admin` / `require_event_staff` (RN03).

---

## ✅ Rastreabilidade de requisitos

| Requisito | Onde                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| RF01 Autenticação        | `routers/auth.py` (signup/login/me), `security.py`, front `auth/`          |
| RF02 Gestão de grupos    | `routers/groups.py`, front `pages/GroupsPage.tsx`, `GroupPage.tsx`         |
| RF03 Convites por link   | `routers/invites.py`, front `group/InvitesTab.tsx`, `pages/JoinPage.tsx`   |
| RF04 Cadastro de jogadores | `routers/players.py` (+ importação e fotos), front `group/PlayersTab.tsx` |
| RF05 Gestão de eventos   | `routers/events.py`, front `group/EventsTab.tsx`                           |
| RF06 Sorteio de times    | front `lib/balance.ts` + `lib/draw.ts` (no navegador), `routers/teams.py` (salva) |
| RF07 Registro de partidas | `routers/matches.py`, front `event/MatchesTab.tsx`, `CurrentMatch.tsx`    |
| RF08 Próximo jogo        | `services/rotation.py::suggest_next`, escolha manual em `FinishMatchModal.tsx` |
| RN01 Usuário ≠ Jogador   | `User` × `Player` são tabelas independentes                                |
| RN02 Escopo de papel     | `GroupMembership.role` por grupo                                           |
| RN03 Controle de edição  | guardas em `deps.py`                                                       |
| RN04 Balanceamento       | `lib/balance.ts` (algoritmos Ótimo e Heurístico do team-balance)           |
| RN05 Rotação de times    | `services/rotation.py` (fila: há mais tempo sem jogar, depois menos jogos) |

---

## 🧠 Sorteio de times (aba Times)

Os algoritmos vêm do projeto **team-balance** e rodam **no navegador**, num Web
Worker (`lib/balance.worker.ts`), para não gerar carga no servidor; o back-end
só valida e grava os times (`PUT /events/{id}/teams`). Notas são tratadas em
"centavos" (nota × 100) e o objetivo é minimizar a diferença entre o time mais
forte e o mais fraco, com times do mesmo tamanho.

- **Ótimo** — garante a menor diferença possível (aprofundamento iterativo +
  branch and bound). Rápido para os casos comuns; tem limite de ~10 s e, se não
  conseguir provar a otimalidade, usa a melhor solução encontrada (e avisa).
- **Heurístico** — maior nota primeiro, sempre para o time mais fraco.
  Instantâneo e quase sempre chega no ótimo.
- **Aleatório** — ignora as notas.
- **Completar com suplentes** — quando os jogadores não dividem igualmente, o
  time menor ganha um suplente cuja nota é a que falta para empatar com os
  completos (o "reforço" que vai entrar no lugar).
- **Panelinha** — fixe jogadores em times antes do sorteio: no mesmo time ficam
  juntos, em times diferentes ficam separados; o algoritmo distribui o resto.
- **Importar selecionados** — cole a lista de confirmados (ex.: do WhatsApp) ou
  envie um .txt/.csv/.xls/.xlsx: só os nomes importam (numeração, emojis e notas
  são ignorados). Os nomes são casados com os jogadores do grupo (sem acento /
  maiúsculas, por partes do nome e por similaridade); nomes ambíguos pedem uma
  escolha e os não encontrados podem ser cadastrados na hora.

Durante o evento os times podem ser editados (mover, adicionar ou tirar
jogadores, criar ou remover times). Refazer o sorteio **arquiva** os times que
já jogaram, então o histórico de partidas e as estatísticas são mantidos.
Exportação em texto (mesmo formato do team-balance) e imagem PNG com fundo claro
ou escuro.

---

## 🏟️ Partidas (aba Partidas)

- **Registrar gols:** toque no jogador que marcou e escolha quem deu a
  assistência (ou "sem assistência"); há "Desfazer" logo após cada gol.
- **Manual:** botões + e − para gols e assistências de cada jogador.
- **Reforço:** um jogador de outro time pode jogar a partida por um time; os
  gols dele contam para aquele lado do placar.
- O placar é sempre a soma dos gols dos jogadores de cada lado.
- **Rodízio:** quem perde sai e o vencedor fica. Com o limite de vitórias
  seguidas configurado, quem completar o limite sai junto com o perdedor (com só
  3 times, o perdedor fica, por não haver outros). No empate, escolhe-se quem
  fica (pênaltis/jokenpô) ou se os dois saem. A sugestão segue as regras, mas
  pode ser alterada.
- **Próxima partida:** gerada automaticamente (entra o time há mais tempo sem
  jogar; empate: quem jogou menos) ou com os times escolhidos manualmente.
- A última partida pode ser reaberta para correções. A tela atualiza sozinha a
  cada 10 s para quem está acompanhando.

Os times mostram jogos, vitórias, empates, derrotas, gols feitos/sofridos e a
sequência atual de vitórias.

## 📊 Estatísticas (aba Estatísticas)

Ranking dos jogadores do evento com gols, assistências e posição. Pontuação de
0 a 100 (o líder tem 100), inspirada no fantasy football:

> gol = 4 pts (+1 para meio-campista, +2 para defensor ou goleiro) ·
> assistência = 3 pts · nota final = pontos ÷ pontos do líder × 100

Admins e moderadores alteram foto e posição dos jogadores nesta tela.
Exportação em texto ou imagem PNG (fundo claro ou escuro).

---

## 📥 Importação de jogadores (RF04)

Na aba **Jogadores** de um grupo, o admin pode clicar em **Importar** e escolher:

- **Colar texto** — uma linha por jogador no formato `Nome - Nota`
  (aceita vírgula ou ponto na nota; linha só com nome usa a nota do meio da
  faixa do grupo).
- **Arquivo `.txt`** — mesmo formato do texto colado.
- **Arquivo `.csv`** — colunas `Nome`, `Nota` e `Posição` (opcional);
  detecta separador `,` ou `;` e cabeçalho automaticamente.
- **Planilha `.xls` / `.xlsx`** — mesmas colunas do CSV (primeira aba).

O back-end (`services/import_players.py`) faz o parse e devolve uma
**pré-visualização** (`POST /groups/{id}/players/import`) comparando cada linha
com os jogadores do grupo pelo nome (sem diferenciar acentos e maiúsculas):

- **mesmo nome e nota diferente → atualizar** a nota do jogador existente;
- **nome novo → adicionar**;
- **mesmo nome e mesma nota → ignorar**, assim como nomes repetidos na lista,
  linhas sem nome e linhas sem nota de quem já está cadastrado (uma lista só
  de nomes nunca sobrescreve notas).

A tabela mostra primeiro as atualizações (nota atual → nova), depois os novos e
por fim os ignorados (com o motivo). Notas fora da faixa do grupo são ajustadas.
Ao confirmar (`POST /groups/{id}/players/bulk`), o servidor reaplica as mesmas
regras.

A faixa de notas (**Nota mínima** e **Nota máxima**, padrão 0 a 10) é definida
nas configurações do grupo; ao reduzi-la, as notas fora da nova faixa são
ajustadas para o limite mais próximo. A **foto** do jogador é opcional: é
recortada em quadrado, redimensionada (512 px) e gravada no banco; é servida em
`/api/photos/{chave}`, uma URL aleatória que muda a cada troca de foto.

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
PATCH  /groups/{id}/members/{user_id}        (papel: admin | moderator | member)
POST   /groups/{id}/invites                  GET /invites/{token}  POST /invites/{token}/accept
GET/POST /groups/{id}/players                PUT/DELETE /groups/{id}/players/{pid}
POST/DELETE /groups/{id}/players/{pid}/photo GET /photos/{key}
POST   /groups/{id}/players/import           POST /groups/{id}/players/bulk
POST   /groups/{id}/players/match-names      (importar selecionados)
GET/POST /groups/{id}/events                 GET/PATCH/DELETE /events/{eid}
GET/PUT/DELETE /events/{eid}/teams           POST /events/{eid}/teams (novo time)
DELETE /events/{eid}/teams/{tid}             PUT/DELETE /events/{eid}/teams/{tid}/players/{pid}
GET/POST /events/{eid}/matches               GET /events/{eid}/matches/current | /suggestion
POST   /events/{eid}/matches/{mid}/goals     POST /events/{eid}/matches/{mid}/stats
GET    /events/{eid}/matches/{mid}/finish-options
POST   /events/{eid}/matches/{mid}/finish | /reopen     DELETE /events/{eid}/matches/{mid}
GET    /events/{eid}/stats                   (ranking)
```
