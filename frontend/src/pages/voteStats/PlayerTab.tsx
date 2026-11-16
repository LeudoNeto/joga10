import { useMemo, useState, type ReactNode } from "react";
import { ChartColumn, CircleQuestionMark, Clock, ListOrdered } from "lucide-react";
import { Alert, Avatar, Badge, Button, Card, StatTile, Switch } from "../../components/ui";
import { fmtDay, fmtSkill, plural } from "../../lib/format";
import { playerVoting, voterName, type StatsIndex } from "../../lib/voteStats";
import type { VoteStatsVoter } from "../../types";
import { ChartCard, Legend, NotaHistogram, PersonModal, Picker, RangeStrip, SCALE_LEGEND } from "./charts";

type Person = Parameters<typeof PersonModal>[0]["person"];

const round2 = (v: number) => Math.round(v * 100) / 100;

export function PlayerTab({
  idx,
  playerId,
  onPlayer,
  onVoter,
}: {
  idx: StatsIndex;
  playerId: number;
  onPlayer: (id: number) => void;
  onVoter: (id: number) => void;
}) {
  // Voters' photos are off by default: no image is loaded until asked.
  const [photos, setPhotos] = useState(false);
  const [person, setPerson] = useState<Person>(null);
  const player = idx.playerById.get(playerId)!;
  const voting = useMemo(() => playerVoting(idx, player), [idx, player]);

  const options = useMemo(
    () =>
      idx.players
        .filter((p) => p.active || idx.byPlayer.has(p.id))
        .map((p) => ({
          id: p.id,
          label: `${p.name} (${plural((idx.byPlayer.get(p.id) ?? []).length, "voto", "votos")})`,
          group: p.active ? "Ativos" : "Inativos",
        })),
    [idx]
  );

  const voterOf = (voterId: number) => idx.voterById.get(voterId)!;
  const photoOf = (v: VoteStatsVoter) => (photos ? v.photo_url : null);

  function openVoter(v: VoteStatsVoter, skill: number | null) {
    setPerson({
      name: voterName(v),
      photo: v.photo_url,
      description:
        skill === null ? `Marcou “Não sei” para ${player.name}` : `Deu nota ${fmtSkill(skill)} para ${player.name}`,
      action: (
        <Button
          variant="secondary"
          onClick={() => {
            setPerson(null);
            onVoter(v.user_id);
          }}
        >
          Ver votos de {voterName(v)}
        </Button>
      ),
    });
  }

  const mean = voting.mean === null ? null : round2(voting.mean);
  const delta = mean === null ? null : round2(mean - player.skill);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Picker label="Jogador" value={playerId} options={options} onChange={onPlayer} />
        <Switch checked={photos} onChange={setPhotos} label="Fotos dos votantes" />
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={!player.photo_url}
            onClick={() => setPerson({ name: player.name, photo: player.photo_url, description: player.position })}
            aria-label={`Ver foto de ${player.name}`}
            className="flex shrink-0 rounded-full enabled:cursor-zoom-in"
          >
            <Avatar name={player.name} src={player.photo_url} size={56} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span className="truncate text-xl font-bold tracking-tight text-fg">{player.name}</span>
              {!player.active && <Badge>inativo</Badge>}
            </p>
            <p className="text-sm text-subtle">{player.position || "Sem posição"}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatTile label="Nota atual" value={fmtSkill(player.skill)} />
          <StatTile
            label="Média votos"
            value={
              mean === null ? (
                "—"
              ) : (
                <>
                  {fmtSkill(mean)}
                  {delta !== null && delta !== 0 && (
                    <span className="ml-1 text-xs font-semibold text-muted">
                      {delta > 0 ? "+" : "−"}
                      {fmtSkill(Math.abs(delta))}
                    </span>
                  )}
                </>
              )
            }
          />
          <StatTile label="Notas" value={voting.scores.length} />
          <StatTile label="Não sei" value={voting.unknown.length} />
          <StatTile label="Sem voto" value={voting.missing.length} className="col-span-2 sm:col-span-1" />
        </div>
        <div className="space-y-1.5">
          <RangeStrip
            min={idx.min}
            max={idx.max}
            values={voting.scores.map((v) => v.skill as number)}
            mean={voting.mean}
            current={player.skill}
          />
          <Legend items={[SCALE_LEGEND.vote, SCALE_LEGEND.mean, SCALE_LEGEND.current]} />
        </div>
        {!player.active && (
          <Alert tone="info">Jogador inativo: não aparece na votação. Os votos abaixo foram dados antes.</Alert>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <ChartCard
          icon={ChartColumn}
          title="Notas recebidas"
          description={photos ? "Toque em uma foto para ampliar" : "Quantos votantes deram cada nota"}
        >
          {voting.scores.length + voting.unknown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Ninguém votou neste jogador ainda.</p>
          ) : (
            <NotaHistogram
              options={idx.options}
              noun={["votante", "votantes"]}
              photos={photos}
              units={[...voting.scores, ...voting.unknown].map((v) => {
                const voter = voterOf(v.voter_id);
                return { key: String(v.voter_id), name: voterName(voter), photo: voter.photo_url, value: v.skill };
              })}
              onUnit={(u) => openVoter(voterOf(Number(u.key)), u.value)}
            />
          )}
        </ChartCard>

        <ChartCard icon={ListOrdered} title="Quem votou" description="Toque em um votante para ver todas as notas dele">
          {voting.scores.length > 0 && (
            <div className="-mx-2 space-y-0.5">
              {voting.scores.map((v) => {
                const voter = voterOf(v.voter_id);
                return (
                  <button
                    key={v.voter_id}
                    type="button"
                    onClick={() => onVoter(voter.user_id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <Avatar name={voterName(voter)} src={photoOf(voter)} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{voterName(voter)}</span>
                      <span className="flex items-center gap-1 text-[11px] text-subtle">
                        <Clock size={11} /> {fmtDay(v.updated_at)}
                      </span>
                    </span>
                    <span className="text-lg font-bold text-fg">{fmtSkill(v.skill as number)}</span>
                  </button>
                );
              })}
            </div>
          )}
          <People
            title="Não sei"
            icon={<CircleQuestionMark size={13} />}
            people={voting.unknown.map((v) => voterOf(v.voter_id))}
            photo={photoOf}
            label={voterName}
            onPick={(v) => onVoter(v.user_id)}
          />
          <People
            title="Ainda não votaram"
            people={voting.missing}
            photo={photoOf}
            label={voterName}
            onPick={(v) => onVoter(v.user_id)}
          />
          {voting.scores.length + voting.unknown.length + voting.missing.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">Nenhum votante para este jogador.</p>
          )}
        </ChartCard>
      </div>

      <PersonModal person={person} onClose={() => setPerson(null)} />
    </div>
  );
}

/** A titled group of names (chips), e.g. who answered "Não sei". */
export function People<T extends { name: string; photo_url: string | null }>({
  title,
  icon,
  people,
  photo,
  label,
  onPick,
}: {
  title: string;
  icon?: ReactNode;
  people: T[];
  photo: (person: T) => string | null;
  label?: (person: T) => string;
  onPick: (person: T) => void;
}) {
  if (!people.length) return null;
  const nameOf = label ?? ((p: T) => p.name);
  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
        {icon} {title} ({people.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(p)}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface-2 py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-fg transition-colors hover:border-line-strong hover:bg-surface-3"
          >
            <Avatar name={nameOf(p)} src={photo(p)} size={20} />
            <span className="truncate">{nameOf(p)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
