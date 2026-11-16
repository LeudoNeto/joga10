import { useMemo, useState } from "react";
import { ChartColumn, CircleQuestionMark, ListOrdered } from "lucide-react";
import { Avatar, Button, Card, RoleBadge, StatTile, Switch } from "../../components/ui";
import { fmtSkill, plural } from "../../lib/format";
import { voterName, voterVoting, type StatsIndex } from "../../lib/voteStats";
import type { VoteStatsPlayer } from "../../types";
import {
  COVERAGE_LEGEND,
  ChartCard,
  CoverageBar,
  Legend,
  NotaBar,
  NotaHistogram,
  PersonModal,
  Picker,
  SCALE_LEGEND,
  Swatch,
} from "./charts";
import { People } from "./PlayerTab";

type Person = Parameters<typeof PersonModal>[0]["person"];

const round2 = (v: number) => Math.round(v * 100) / 100;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmtSkill(Math.abs(v))}`;

export function VoterTab({
  idx,
  voterId,
  onPlayer,
  onVoter,
}: {
  idx: StatsIndex;
  voterId: number;
  onPlayer: (id: number) => void;
  onVoter: (id: number) => void;
}) {
  // Players' photos are off by default: no image is loaded until asked.
  const [photos, setPhotos] = useState(false);
  const [person, setPerson] = useState<Person>(null);
  const voter = idx.voterById.get(voterId)!;
  const voting = useMemo(() => voterVoting(idx, voter), [idx, voter]);
  const name = voterName(voter);

  const options = useMemo(
    () =>
      idx.electorate.map((v) => ({
        id: v.user_id,
        label: `${voterName(v)} (${plural((idx.byVoter.get(v.user_id) ?? []).length, "voto", "votos")})`,
      })),
    [idx]
  );

  const playerOf = (id: number) => idx.playerById.get(id)!;
  const photoOf = (p: VoteStatsPlayer) => (photos ? p.photo_url : null);

  function openPlayer(p: VoteStatsPlayer, skill: number | null) {
    setPerson({
      name: p.name,
      photo: p.photo_url,
      description: skill === null ? `${name} marcou “Não sei”` : `Recebeu nota ${fmtSkill(skill)} de ${name}`,
      action: (
        <Button
          variant="secondary"
          onClick={() => {
            setPerson(null);
            onPlayer(p.id);
          }}
        >
          Ver votos em {p.name}
        </Button>
      ),
    });
  }

  const bias = voting.bias === null ? null : round2(voting.bias);
  const c = voting.coverage;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Picker label="Votante" value={voterId} options={options} onChange={onVoter} />
        <Switch checked={photos} onChange={setPhotos} label="Fotos dos jogadores" />
      </div>

      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={!voter.photo_url}
            onClick={() => setPerson({ name, photo: voter.photo_url, description: voter.name })}
            aria-label={`Ver foto de ${name}`}
            className="flex shrink-0 rounded-full enabled:cursor-zoom-in"
          >
            <Avatar name={name} src={voter.photo_url} size={56} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold tracking-tight text-fg">{name}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-subtle">
              {voter.name !== name && <span className="truncate">Conta: {voter.name}</span>}
              <RoleBadge role={voter.role} />
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatTile label="Notas dadas" value={voting.scores.length} />
          <StatTile label="Não sei" value={voting.unknown.length} />
          <StatTile label="Faltam" value={voting.missing.length} />
          <StatTile
            label="Média das notas"
            value={voting.mean === null ? "—" : fmtSkill(round2(voting.mean))}
          />
          <StatTile
            label="Vs. os outros"
            className="col-span-2 sm:col-span-1"
            value={
              <>
                {bias === null ? "—" : signed(bias)}
                <span className="block text-[11px] font-medium text-subtle">
                  {bias === null
                    ? "sem jogadores em comum"
                    : Math.abs(bias) < 0.25
                    ? "alinhado ao grupo"
                    : bias > 0
                    ? "dá notas mais altas"
                    : "dá notas mais baixas"}
                </span>
              </>
            }
          />
        </div>
        <div className="space-y-2">
          <CoverageBar coverage={c} label={`Votação de ${name}`} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Legend items={COVERAGE_LEGEND} />
            <span className="text-xs tabular text-muted">
              {c.score + c.unknown} de {plural(c.total, "jogador", "jogadores")} avaliados
            </span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        <ChartCard
          icon={ChartColumn}
          title="Notas dadas"
          description={photos ? "Toque em uma foto para ampliar" : "Quantos jogadores receberam cada nota"}
        >
          {voting.scores.length + voting.unknown.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">{name} ainda não votou.</p>
          ) : (
            <NotaHistogram
              options={idx.options}
              noun={["jogador", "jogadores"]}
              photos={photos}
              units={[...voting.scores, ...voting.unknown].map((v) => {
                const p = playerOf(v.player_id);
                return { key: String(p.id), name: p.name, photo: p.photo_url, value: v.skill };
              })}
              onUnit={(u) => openPlayer(playerOf(Number(u.key)), u.value)}
            />
          )}
        </ChartCard>

        <ChartCard icon={ListOrdered} title="Nota por jogador" description="Toque em um jogador para ver todos os votos nele">
          {voting.scores.length > 0 && (
            <>
              <Legend
                items={[
                  { label: `Nota de ${name}`, mark: <Swatch className="bg-viz-score" /> },
                  { label: "Média dos outros", mark: SCALE_LEGEND.mean.mark },
                ]}
              />
              <div className="-mx-2 space-y-0.5">
                {voting.scores.map((v) => {
                  const p = playerOf(v.player_id);
                  const others = voting.othersMean.get(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onPlayer(p.id)}
                      className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2 sm:grid-cols-[auto_minmax(0,9rem)_1fr_auto]"
                    >
                      <Avatar name={p.name} src={photoOf(p)} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{p.name}</span>
                        <span className="block text-[11px] tabular text-subtle">
                          {others === undefined ? "só este voto" : `outros: ${fmtSkill(round2(others))}`}
                        </span>
                      </span>
                      <span className="col-span-3 col-start-1 row-start-2 pt-1 sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:pt-0">
                        <NotaBar min={idx.min} max={idx.max} value={v.skill as number} reference={others} />
                      </span>
                      <span className="col-start-3 row-start-1 text-lg font-bold text-fg sm:col-start-4">
                        {fmtSkill(v.skill as number)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <People
            title="Não sei"
            icon={<CircleQuestionMark size={13} />}
            people={voting.unknown.map((v) => playerOf(v.player_id))}
            photo={photoOf}
            onPick={(p) => onPlayer(p.id)}
          />
          <People title="Ainda não votou" people={voting.missing} photo={photoOf} onPick={(p) => onPlayer(p.id)} />
          {voting.scores.length + voting.unknown.length + voting.missing.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">Nenhum jogador para avaliar.</p>
          )}
        </ChartCard>
      </div>

      <PersonModal person={person} onClose={() => setPerson(null)} />
    </div>
  );
}
