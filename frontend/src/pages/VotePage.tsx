import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  CircleCheck,
  CircleQuestionMark,
  Image as ImageIcon,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Vote,
  WifiOff,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { ApiError, api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useConfirm, useToast } from "../components/Feedback";
import {
  Alert,
  Avatar,
  Button,
  Card,
  EmptyState,
  Input,
  PhotoModal,
  SectionTitle,
  Segmented,
  Select,
  Spinner,
  cx,
} from "../components/ui";
import { errorMessage, fmtSkill, isStaff, plural } from "../lib/format";
import {
  VOTE_SECTIONS,
  groupForVoting,
  parseVote,
  retryDelay,
  sameSkill,
  sameVote,
  voteOptions,
  withoutSent,
  type VoteSection,
} from "../lib/votes";
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

/** Pause after the last change before saving (a slider drag becomes one save). */
const SAVE_DELAY = 700;
/** Failed saves in a row before the problem is shown to the voter. */
const ALERT_AFTER = 3;

/** Votes save by themselves: a short pause after the last change sends every
 * pending vote in one request. Connection and server failures are retried
 * with a growing delay; a vote the server refuses (4xx) is dropped with a
 * message, since sending it again would never work. */
function useVoteAutosave(
  groupId: number,
  onSaved: (saved: PlayerVote[]) => void,
  onRejected: (message: string) => void
) {
  const [pending, setPending] = useState<Draft>(new Map());
  const [failures, setFailures] = useState(0);
  // Refs: timers and the request outlive the render that started them.
  const pendingRef = useRef(pending);
  const failuresRef = useRef(0);
  const sending = useRef(false);
  const alive = useRef(true);
  const timer = useRef<number | undefined>(undefined);
  const callbacks = useRef({ onSaved, onRejected });
  callbacks.current = { onSaved, onRejected };

  const setPendingNow = (next: Draft) => {
    pendingRef.current = next;
    setPending(next);
  };
  const setFailuresNow = (n: number) => {
    failuresRef.current = n;
    setFailures(n);
  };

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (sending.current || !pendingRef.current.size) return;
    const sent = new Map(pendingRef.current);
    sending.current = true;
    try {
      const saved = await api.put<PlayerVote[]>(`/groups/${groupId}/votes`, {
        votes: [...sent].map(([player_id, skill]) => ({ player_id, skill })),
      });
      callbacks.current.onSaved(saved);
      setPendingNow(withoutSent(pendingRef.current, sent));
      setFailuresNow(0);
    } catch (err) {
      const refused = err instanceof ApiError && err.status >= 400 && err.status < 500 && ![408, 429].includes(err.status);
      if (refused) {
        callbacks.current.onRejected(err.message);
        setPendingNow(withoutSent(pendingRef.current, sent));
        setFailuresNow(0);
      } else {
        setFailuresNow(failuresRef.current + 1);
      }
    } finally {
      sending.current = false;
    }
    // Votes made while saving, or a retry; after leaving the page, no retries.
    if (alive.current && pendingRef.current.size) {
      timer.current = window.setTimeout(flush, failuresRef.current ? retryDelay(failuresRef.current) : SAVE_DELAY);
    }
  }, [groupId]);

  const queue = useCallback(
    (playerId: number, value: number | null) => {
      setPendingNow(new Map(pendingRef.current).set(playerId, value));
      if (failuresRef.current) return; // the retry already scheduled sends it too
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY);
    },
    [flush]
  );

  useEffect(() => {
    alive.current = true;
    // Save right away when the connection comes back or the page is left
    // (app switched on the phone, tab hidden, navigation inside the app).
    const onHidden = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("online", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("online", flush);
      document.removeEventListener("visibilitychange", onHidden);
      alive.current = false;
      flush();
    };
  }, [flush]);

  return { pending, failing: failures >= ALERT_AFTER, queue, retryNow: flush };
}

/** zoom: small avatar, tap to open it bigger · big: large photo in each row */
type PhotoMode = "zoom" | "big";

const PHOTO_MODE_KEY = "joga10_vote_photos";

function readPhotoMode(): PhotoMode {
  try {
    return localStorage.getItem(PHOTO_MODE_KEY) === "zoom" ? "zoom" : "big";
  } catch {
    return "big";
  }
}

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
  // Votes as loaded with the page: they place the players in the sections, so
  // rows don't jump from "Não votados" to "Já votados" as each vote saves.
  const [loadedVotes, setLoadedVotes] = useState<Map<number, PlayerVote>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [viewing, setViewing] = useState<Player | null>(null); // photo opened bigger
  const [photoMode, setPhotoMode] = useState<PhotoMode>(readPhotoMode);

  const load = useCallback(async () => {
    try {
      const [g, ps, vs] = await Promise.all([
        api.get<GroupDetail>(`/groups/${id}`),
        api.get<Player[]>(`/groups/${id}/players`),
        api.get<PlayerVote[]>(`/groups/${id}/votes`),
      ]);
      setGroup(g);
      setPlayers(ps);
      const loaded = new Map(vs.map((v) => [v.player_id, v]));
      setVotes(loaded);
      setLoadedVotes(loaded);
    } catch (err) {
      setError(errorMessage(err, "Falha ao carregar a votação"));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const { pending, failing, queue, retryNow } = useVoteAutosave(
    id,
    (saved) => setVotes(new Map(saved.map((v) => [v.player_id, v]))),
    (message) => toast(message, { tone: "error" })
  );

  // Warn before closing the tab while a vote is still on its way.
  useEffect(() => {
    if (!pending.size) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [pending.size]);

  const me = group?.members.find((m) => m.user_id === user?.id);
  const selfId = me?.player_id ?? null;
  const sections = useMemo(
    () => groupForVoting(players ?? [], loadedVotes, selfId),
    [players, loadedVotes, selfId]
  );

  if (error) return <Alert>{error}</Alert>;
  if (!group || !players) return <Spinner label="Carregando votação..." />;
  if (!me) return null;

  const options = voteOptions(group.min_skill, group.max_skill);
  const eligible = VOTE_SECTIONS.flatMap((s) => sections[s]);
  const valueOf = (playerId: number): number | null | undefined =>
    pending.has(playerId) ? pending.get(playerId) : votes.get(playerId)?.skill;
  const rated = eligible.filter((p) => typeof valueOf(p.id) === "number").length;
  const q = query.trim().toLowerCase();
  const matches = (p: Player) =>
    !q || p.name.toLowerCase().includes(q) || (p.position ?? "").toLowerCase().includes(q);
  const self = players.find((p) => p.id === selfId);

  function change(playerId: number, value: number | null) {
    if (!sameVote(valueOf(playerId), value)) queue(playerId, value);
  }

  function choosePhotoMode(mode: PhotoMode) {
    setPhotoMode(mode);
    try {
      localStorage.setItem(PHOTO_MODE_KEY, mode);
    } catch {
      /* storage unavailable: the choice just isn't remembered */
    }
  }

  async function back() {
    // Leaving saves what is pending (on unmount); ask only when saving is failing.
    if (
      failing &&
      pending.size &&
      !(await confirm({
        title: "Sair sem salvar?",
        message: `${plural(pending.size, "voto ainda não foi salvo", "votos ainda não foram salvos")} por falta de conexão.`,
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
          A média dos votos de cada jogador ajuda os administradores a definir a nota usada no sorteio.
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
                    {rated} de {eligible.length} avaliados
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:max-w-xs">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar jogador ou posição"
                    className="pl-9"
                  />
                </div>
                <Segmented<PhotoMode>
                  size="sm"
                  label="Modo de fotos"
                  value={photoMode}
                  onChange={choosePhotoMode}
                  options={[
                    { value: "zoom", label: "Tocar para ampliar", icon: ZoomIn },
                    { value: "big", label: "Fotos grandes", icon: ImageIcon },
                  ]}
                  className="w-full sm:w-auto"
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
                    <div className="space-y-3">
                      {list.map((p) => (
                        <VoteRow
                          key={p.id}
                          player={p}
                          value={valueOf(p.id)}
                          unsaved={failing && pending.has(p.id)}
                          options={options}
                          min={group.min_skill}
                          max={group.max_skill}
                          onChange={(value) => change(p.id, value)}
                          photoMode={photoMode}
                          onPhoto={() => setViewing(p)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
              {q && !eligible.some(matches) && (
                <p className="py-6 text-center text-sm text-muted">Nenhum jogador encontrado.</p>
              )}

              {/* Votes save by themselves; only a save failing again and again shows up. */}
              {failing && pending.size > 0 && (
                <div className="sticky bottom-4 z-30">
                  <div
                    role="alert"
                    className="flex items-center gap-3 rounded-2xl border border-red-500/40 bg-surface/95 py-2.5 pl-4 pr-2.5 shadow-pop backdrop-blur sm:pr-4"
                  >
                    <WifiOff size={18} className="shrink-0 text-red-500" />
                    <p className="min-w-0 flex-1 text-sm text-muted">
                      <strong className="text-fg">Sem conexão com o servidor.</strong>{" "}
                      {plural(pending.size, "voto ainda não foi salvo", "votos ainda não foram salvos")}; tentando de
                      novo...
                    </p>
                    <Button size="sm" variant="secondary" icon={RefreshCw} onClick={retryNow} className="shrink-0">
                      Tentar agora
                    </Button>
                  </div>
                </div>
              )}
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
  unsaved,
  options,
  min,
  max,
  onChange,
  photoMode,
  onPhoto,
}: {
  player: Player;
  value: number | null | undefined; // undefined: not voted yet
  unsaved: boolean; // still not saved after several attempts
  options: number[];
  min: number;
  max: number;
  onChange: (value: number | null) => void;
  photoMode: PhotoMode;
  onPhoto: () => void;
}) {
  // Large photo only when there is one to show; otherwise the compact row.
  const [photoFailed, setPhotoFailed] = useState(false);
  const big = photoMode === "big" && !!player.photo_url && !photoFailed;
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

  const avatar = <Avatar name={player.name} src={player.photo_url} size={40} />;

  const heading = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-fg">{player.name}</p>
        <p className="truncate text-xs text-subtle">{player.position || "Sem posição"}</p>
      </div>
      {/* The player's real nota (the one used by the draws); the member's own
          vote is the selected button below. */}
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Nota atual</p>
        <p className="text-xl font-bold leading-tight tabular text-fg">{fmtSkill(player.skill)}</p>
        {unsaved && <span className="block text-[11px] font-semibold text-accent">voto não salvo</span>}
      </div>
    </>
  );

  const controls = (
    <div role="radiogroup" aria-label={`Nota de ${player.name}`} className={cx("space-y-1.5", !big && "sm:pl-[52px]")}>
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
  );

  // One card per player, so a photo never looks like it belongs to the next one.
  const card = cx("overflow-hidden transition-shadow", unsaved && "ring-1 ring-brand-500/40");
  const body = cx("p-4 transition-colors", unsaved && "bg-brand-600/[0.06]");

  if (big)
    return (
      <Card className={card}>
        <div className={cx(body, "space-y-3 sm:flex sm:gap-4 sm:space-y-0")}>
          <img
            src={player.photo_url ?? undefined}
            alt={player.name}
            loading="lazy"
            onError={() => setPhotoFailed(true)}
            className="aspect-square w-full rounded-xl bg-surface-2 object-cover sm:w-44 sm:shrink-0"
          />
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex items-center gap-3">{heading}</div>
            {controls}
          </div>
        </div>
      </Card>
    );

  return (
    <Card className={card}>
      <div className={cx(body, "space-y-2.5")}>
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
          {heading}
        </div>
        {controls}
      </div>
    </Card>
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
