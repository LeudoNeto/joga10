import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  CircleCheck,
  CircleQuestionMark,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Undo2,
  UserCheck,
  Vote,
  type LucideIcon,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useConfirm, useToast } from "../components/Feedback";
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  PhotoModal,
  SectionTitle,
  Select,
  Spinner,
  cx,
} from "../components/ui";
import { errorMessage, fmtSkill, isStaff, plural } from "../lib/format";
import { VOTE_SECTIONS, groupForVoting, parseVote, sameSkill, voteOptions, type VoteSection } from "../lib/votes";
import type { GroupDetail, Member, Player, PlayerVote } from "../types";

const SECTION_INFO: Record<VoteSection, { title: string; description: string; icon: LucideIcon }> = {
  pending: {
    title: "Não votados",
    description: "Jogadores novos no grupo ou que você ainda não avaliou.",
    icon: Sparkles,
  },
  unknown: {
    title: "Marcados como “Não sei”",
    description: "Se já viu algum deles jogar, dê a sua nota.",
    icon: CircleQuestionMark,
  },
  voted: {
    title: "Já votados",
    description: "Mudou de opinião? Altere a nota quando quiser.",
    icon: CircleCheck,
  },
};

/** Votes changed and not saved yet: nota, or null for "Não sei". */
type Draft = Map<number, number | null>;

/** Nota voting: the member rates every other player of the group. The
 * averages become a suggestion that admins may apply to the real notas. */
export function VotePage() {
  const { groupId } = useParams<{ groupId: string }>();
  const id = Number(groupId);
  const { user } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [votes, setVotes] = useState<Map<number, PlayerVote>>(new Map());
  const [draft, setDraft] = useState<Draft>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Player | null>(null); // photo opened bigger

  const load = useCallback(async () => {
    try {
      const [g, ps, vs] = await Promise.all([
        api.get<GroupDetail>(`/groups/${id}`),
        api.get<Player[]>(`/groups/${id}/players`),
        api.get<PlayerVote[]>(`/groups/${id}/votes`),
      ]);
      setGroup(g);
      setPlayers(ps);
      setVotes(new Map(vs.map((v) => [v.player_id, v])));
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar a votação"));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Warn before closing the tab with votes not saved.
  useEffect(() => {
    if (!draft.size) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [draft.size]);

  const me = group?.members.find((m) => m.user_id === user?.id);
  const selfId = me?.player_id ?? null;
  // Sections follow the *saved* votes, so rows do not jump around while voting.
  const sections = useMemo(() => groupForVoting(players ?? [], votes, selfId), [players, votes, selfId]);

  if (error) return <Alert>{error}</Alert>;
  if (!group || !players) return <Spinner label="Carregando votação..." />;
  if (!me) return null;

  const options = voteOptions(group.min_skill, group.max_skill);
  const eligible = VOTE_SECTIONS.flatMap((s) => sections[s]);
  const valueOf = (playerId: number): number | null | undefined =>
    draft.has(playerId) ? draft.get(playerId) : votes.get(playerId)?.skill;
  const rated = eligible.filter((p) => typeof valueOf(p.id) === "number").length;
  const q = query.trim().toLowerCase();
  const matches = (p: Player) =>
    !q || p.name.toLowerCase().includes(q) || (p.position ?? "").toLowerCase().includes(q);
  const self = players.find((p) => p.id === selfId);

  function change(playerId: number, value: number | null) {
    setDraft((prev) => {
      const next = new Map(prev);
      const saved = votes.get(playerId);
      const same =
        saved !== undefined &&
        (saved.skill === null || value === null ? saved.skill === value : sameSkill(saved.skill, value));
      if (same) next.delete(playerId);
      else next.set(playerId, value);
      return next;
    });
  }

  async function save() {
    if (!draft.size) return;
    setBusy(true);
    try {
      const saved = await api.put<PlayerVote[]>(`/groups/${id}/votes`, {
        votes: [...draft].map(([player_id, skill]) => ({ player_id, skill })),
      });
      setVotes(new Map(saved.map((v) => [v.player_id, v])));
      setDraft(new Map());
      toast(`Votação salva (${plural(draft.size, "voto", "votos")})`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      toast(errorMessage(err, "Falha ao salvar a votação"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function back() {
    if (
      draft.size &&
      !(await confirm({
        title: "Sair sem salvar?",
        message: `Você tem ${plural(draft.size, "voto não salvo", "votos não salvos")}.`,
        confirmLabel: "Sair sem salvar",
        danger: true,
      }))
    )
      return;
    navigate(`/groups/${id}?tab=players`);
  }

  return (
    <div className="space-y-6">
      <button type="button" onClick={back} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ChevronLeft size={16} /> {group.name}
      </button>

      <div>
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          <Vote className="text-accent" /> Votação de notas
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Dê a sua nota, de {fmtSkill(group.min_skill)} a {fmtSkill(group.max_skill)}, para os jogadores do grupo.
          Seus votos são secretos: os administradores veem apenas a média de cada jogador e decidem quando usá-la
          como a nota do sorteio.
        </p>
      </div>

      {selfId === null || !self ? (
        <PickPlayer group={group} players={players} me={me} onPicked={setGroup} />
      ) : (
        <>
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <Avatar name={self.name} src={self.photo_url} size={44} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Votando como</p>
              <p className="truncate font-semibold text-fg">{self.name}</p>
              <p className="text-xs text-subtle">Você não vota na sua própria nota.</p>
            </div>
            {eligible.length > 0 && (
              <div className="w-full sm:w-64">
                <div className="flex justify-between text-xs text-muted">
                  <span>
                    {rated} de {eligible.length} com nota
                  </span>
                  <span className="tabular">{Math.round((rated / eligible.length) * 100)}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-3">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-700 to-brand-500 transition-[width]"
                    style={{ width: `${(rated / eligible.length) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </Card>

          {eligible.length === 0 ? (
            <EmptyState
              icon={Vote}
              title="Nenhum jogador para votar"
              description="Quando outros jogadores forem cadastrados no grupo, eles aparecem aqui."
            />
          ) : (
            <>
              <div className="relative w-full max-w-xs">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar jogador ou posição"
                  className="pl-9"
                />
              </div>

              {VOTE_SECTIONS.map((key) => {
                const list = sections[key].filter(matches);
                if (!list.length) return null;
                const info = SECTION_INFO[key];
                return (
                  <section key={key} className="space-y-2.5">
                    <SectionTitle
                      icon={info.icon}
                      title={`${info.title} (${sections[key].length})`}
                      description={info.description}
                    />
                    <Card className="divide-y divide-line overflow-hidden">
                      {list.map((p) => (
                        <VoteRow
                          key={p.id}
                          player={p}
                          value={valueOf(p.id)}
                          changed={draft.has(p.id)}
                          options={options}
                          min={group.min_skill}
                          max={group.max_skill}
                          onChange={(value) => change(p.id, value)}
                          onPhoto={() => setViewing(p)}
                        />
                      ))}
                    </Card>
                  </section>
                );
              })}
              {q && !eligible.some(matches) && (
                <p className="py-6 text-center text-sm text-muted">Nenhum jogador encontrado.</p>
              )}

              <div className="sticky bottom-4 z-30">
                <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface/95 py-2.5 pl-4 pr-2.5 shadow-pop backdrop-blur sm:gap-3 sm:py-3 sm:pr-4">
                  <p className="min-w-0 text-sm text-muted">
                    {draft.size ? (
                      <strong className="text-fg">
                        {plural(draft.size, "alteração", "alterações")}
                        <span className="hidden sm:inline"> não {draft.size === 1 ? "salva" : "salvas"}</span>
                      </strong>
                    ) : (
                      "Tudo salvo"
                    )}
                  </p>
                  <div className="flex shrink-0 gap-1.5 sm:gap-2">
                    {draft.size > 0 && (
                      <Button
                        variant="ghost"
                        icon={Undo2}
                        onClick={() => setDraft(new Map())}
                        disabled={busy}
                        aria-label="Descartar alterações"
                        title="Descartar alterações"
                      >
                        <span className="hidden sm:inline">Descartar</span>
                      </Button>
                    )}
                    <Button icon={Save} onClick={save} loading={busy} disabled={!draft.size}>
                      Salvar<span className="hidden sm:inline"> votação</span>
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      <PhotoModal
        src={viewing?.photo_url ?? null}
        name={viewing?.name ?? ""}
        description={viewing?.position}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

const chipBase =
  "h-9 min-w-[2.25rem] rounded-lg border text-sm font-semibold tabular transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60";
const chipOn = "border-brand-500 bg-brand-600 text-white shadow-sm";
const chipOff = "border-line bg-surface-2 text-fg hover:border-line-strong hover:bg-surface-3";
const chipWide = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-2 sm:px-3";

function VoteRow({
  player,
  value,
  changed,
  options,
  min,
  max,
  onChange,
  onPhoto,
}: {
  player: Player;
  value: number | null | undefined; // undefined: not voted yet
  changed: boolean;
  options: number[];
  min: number;
  max: number;
  onChange: (value: number | null) => void;
  onPhoto: () => void;
}) {
  // "Personalizado" opened by hand; a nota off the buttons keeps it open anyway.
  const [open, setOpen] = useState(false);
  // Text in the custom input while it is being edited (null: shows the nota).
  const [text, setText] = useState<string | null>(null);
  const custom = typeof value === "number" && (open || !options.some((o) => sameSkill(o, value)));
  const invalid = text !== null && parseVote(text, min, max) === null;
  const step = max - min <= 10 ? 0.01 : 0.1;

  function pick(next: number | null) {
    setOpen(false);
    onChange(next);
  }

  function openCustom() {
    setOpen(true);
    if (typeof value !== "number") onChange(Math.round(((min + max) / 2) * 100) / 100);
  }

  function type(raw: string) {
    setText(raw);
    const next = parseVote(raw, min, max);
    if (next !== null) onChange(next);
  }

  const avatar = (
    <Avatar name={player.name} src={player.photo_url} size={40} className={player.active ? "" : "opacity-50 grayscale"} />
  );

  return (
    <div className={cx("space-y-2.5 px-4 py-3 transition-colors", changed && "bg-brand-600/[0.06]")}>
      <div className="flex items-center gap-3">
        {player.photo_url ? (
          <button
            type="button"
            onClick={onPhoto}
            aria-label={`Ver foto de ${player.name}`}
            title="Ver foto"
            className="flex shrink-0 cursor-zoom-in rounded-full transition-shadow hover:ring-2 hover:ring-brand-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            {avatar}
          </button>
        ) : (
          avatar
        )}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-medium text-fg">
            <span className="truncate">{player.name}</span>
            {!player.active && <Badge>inativo</Badge>}
          </p>
          <p className="truncate text-xs text-subtle">{player.position || "Sem posição"}</p>
        </div>
        <div className="shrink-0 text-right">
          {value === undefined ? (
            <span className="text-xs text-subtle">sem nota</span>
          ) : value === null ? (
            <Badge tone="amber" icon={CircleQuestionMark}>
              Não sei
            </Badge>
          ) : (
            <span className="text-xl font-bold tabular text-fg">{fmtSkill(value)}</span>
          )}
          {changed && <span className="block text-[11px] font-semibold text-accent">não salvo</span>}
        </div>
      </div>
      <div role="radiogroup" aria-label={`Nota de ${player.name}`} className="space-y-1.5 sm:pl-[52px]">
        <div className="grid grid-cols-6 gap-1.5 sm:flex sm:flex-wrap">
          {options.map((o) => {
            const active = !custom && typeof value === "number" && sameSkill(value, o);
            return (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => pick(o)}
                className={cx(chipBase, "px-2", active ? chipOn : chipOff)}
              >
                {fmtSkill(o)}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:flex">
          <button
            type="button"
            role="radio"
            aria-checked={custom}
            onClick={openCustom}
            className={cx(chipBase, chipWide, custom ? chipOn : chipOff)}
          >
            <SlidersHorizontal size={14} className="shrink-0 max-[359px]:hidden" /> Personalizado
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            onClick={() => pick(null)}
            className={cx(
              chipBase,
              chipWide,
              value === null ? "border-amber-500/60 bg-amber-500/15 text-amber-700 dark:text-amber-300" : chipOff
            )}
          >
            <CircleQuestionMark size={14} className="shrink-0 max-[359px]:hidden" /> Não sei
          </button>
        </div>
        {custom && (
          <div className="flex items-center gap-3 pt-1 sm:max-w-md">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => onChange(Math.round(Number(e.target.value) * 100) / 100)}
              aria-label={`Nota personalizada de ${player.name}`}
              className="min-w-0 flex-1 accent-brand-600"
            />
            <div className="w-20 shrink-0">
              <Input
                inputMode="decimal"
                value={text ?? fmtSkill(value)}
                onFocus={(e) => setText(e.target.value)}
                onChange={(e) => type(e.target.value)}
                onBlur={() => setText(null)}
                aria-label={`Nota de ${player.name} (${fmtSkill(min)} a ${fmtSkill(max)})`}
                aria-invalid={invalid}
                title={`Entre ${fmtSkill(min)} e ${fmtSkill(max)}`}
                className={cx("h-9 text-right tabular", invalid && "border-red-500/70 focus:border-red-500")}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** The voter must be linked to their player first (nobody votes on themselves). */
function PickPlayer({
  group,
  players,
  me,
  onPicked,
}: {
  group: GroupDetail;
  players: Player[];
  me: Member;
  onPicked: (detail: GroupDetail) => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const staff = isStaff(group.role);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => {
    const claimed = new Set(group.members.filter((m) => m.user_id !== me.user_id).map((m) => m.player_id));
    return players
      .filter((p) => !claimed.has(p.id))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
  }, [group.members, me.user_id, players]);
  const picked = available.find((p) => p.id === Number(choice));

  async function save() {
    if (!picked) return;
    const ok = await confirm({
      title: `Você é ${picked.name}?`,
      message: staff ? (
        "Seu usuário ficará associado a este jogador. Como administrador/moderador, você poderá alterar depois na aba Seu Jogador."
      ) : (
        <>
          Seu usuário ficará associado a <strong>{picked.name}</strong>.{" "}
          <strong>Essa escolha não poderá ser alterada depois</strong> — somente administradores ou moderadores do
          grupo podem mudá-la.
        </>
      ),
      confirmLabel: "Sim, sou eu",
    });
    if (!ok) return;
    setBusy(true);
    try {
      onPicked(
        await api.put<GroupDetail>(`/groups/${group.id}/members/${me.user_id}/player`, { player_id: picked.id })
      );
      toast(`Agora você é ${picked.name}`);
    } catch (err) {
      toast(errorMessage(err, "Falha ao salvar"), { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <SectionTitle
        icon={UserCheck}
        title="Antes de votar, diga quem é você"
        description="Ninguém vota na própria nota, então precisamos saber qual jogador do grupo é você."
      />
      {staff ? (
        <Alert tone="info">
          Como administrador/moderador, você poderá trocar o seu jogador depois na aba <strong>Seu Jogador</strong>.
        </Alert>
      ) : (
        <Alert tone="warning">
          Atenção: depois de confirmar, você <strong>não poderá trocar</strong> o seu jogador. Somente administradores
          ou moderadores do grupo podem mudá-lo.
        </Alert>
      )}
      {available.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="Nenhum jogador disponível"
          description="Peça a um administrador para cadastrar o seu jogador no grupo."
        />
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <Select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Seu jogador">
              <option value="">Selecione o seu jogador...</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.position ? ` · ${p.position}` : ""}
                  {p.active ? "" : " (inativo)"}
                </option>
              ))}
            </Select>
          </div>
          <Button icon={Check} disabled={!picked} loading={busy} onClick={save}>
            Confirmar
          </Button>
        </div>
      )}
    </Card>
  );
}
