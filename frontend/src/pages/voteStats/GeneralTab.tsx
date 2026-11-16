import { useMemo, type ReactNode } from "react";
import { ArrowLeftRight, ChartColumn, CircleQuestionMark, ChartPie, Split, Users } from "lucide-react";
import { Avatar, Card, EmptyState, StatTile, cx } from "../../components/ui";
import { fmtSkill, plural } from "../../lib/format";
import {
  activeVotes,
  mean,
  overallCoverage,
  pct,
  playerVoting,
  voterCoverage,
  voterName,
  type StatsIndex,
} from "../../lib/voteStats";
import {
  COVERAGE_LEGEND,
  ChartCard,
  CoverageBar,
  Dumbbell,
  HistogramTable,
  Legend,
  NotaHistogram,
  RangeStrip,
  SCALE_LEGEND,
  Swatch,
} from "./charts";

const TOP = 6;

export function GeneralTab({
  idx,
  onPlayer,
  onVoter,
}: {
  idx: StatsIndex;
  onPlayer: (id: number) => void;
  onVoter: (id: number) => void;
}) {
  const stats = useMemo(() => {
    const votes = activeVotes(idx);
    const scores = votes.filter((v) => v.skill !== null).map((v) => v.skill as number);
    const perPlayer = idx.active.map((p) => ({ player: p, ...playerVoting(idx, p) }));
    const perVoter = idx.electorate
      .map((v) => ({ voter: v, coverage: voterCoverage(idx, v) }))
      .sort(
        (a, b) =>
          b.coverage.score - a.coverage.score ||
          b.coverage.unknown - a.coverage.unknown ||
          voterName(a.voter).localeCompare(voterName(b.voter), "pt-BR")
      );
    return {
      votes,
      scores,
      coverage: overallCoverage(idx),
      mean: mean(scores),
      voted: perVoter.filter((v) => v.coverage.score + v.coverage.unknown > 0).length,
      perVoter,
      // Biggest gaps between the vote average and the nota used today.
      gaps: perPlayer
        .filter((p) => p.mean !== null && Math.abs(p.mean - p.player.skill) >= 0.005)
        .sort((a, b) => Math.abs(b.mean! - b.player.skill) - Math.abs(a.mean! - a.player.skill))
        .slice(0, TOP),
      // Most divided opinions (spread needs 2+ notas).
      divided: perPlayer
        .filter((p) => p.spread !== null && p.spread > 0)
        .sort((a, b) => b.spread! - a.spread!)
        .slice(0, TOP),
      // Players the group knows least.
      unknown: perPlayer
        .filter((p) => p.unknown.length > 0)
        .sort((a, b) => b.unknown.length - a.unknown.length || a.player.name.localeCompare(b.player.name, "pt-BR"))
        .slice(0, TOP),
    };
  }, [idx]);

  const unlinked = idx.voters.length - idx.electorate.length;
  const c = stats.coverage;

  if (!stats.votes.length)
    return (
      <EmptyState
        icon={ChartColumn}
        title="Ainda não há votos"
        description="As estatísticas aparecem assim que os membros votarem pelo botão Votação, na aba Jogadores."
      />
    );

  const mostUnknown = Math.max(1, ...stats.unknown.map((p) => p.unknown.length));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Users}
          label="Votaram"
          value={
            <>
              {stats.voted} <span className="text-sm font-medium text-subtle">de {idx.voters.length} membros</span>
            </>
          }
        />
        <StatTile label="Notas dadas" value={stats.scores.length} />
        <StatTile label="Não sei" value={c.unknown} />
        <StatTile label="Média das notas" value={stats.mean === null ? "—" : fmtSkill(Math.round(stats.mean * 100) / 100)} />
      </div>

      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-fg">
            <ChartPie size={17} className="text-accent" /> Cobertura da votação
          </h2>
          <p className="text-xs text-subtle">
            {plural(c.total, "avaliação esperada", "avaliações esperadas")}: cada membro com jogador × os outros{" "}
            {plural(idx.active.length, "jogador ativo", "jogadores ativos")}
          </p>
        </div>
        <CoverageBar coverage={c} tall label="Cobertura da votação" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Legend items={COVERAGE_LEGEND} />
          <p className="text-xs tabular text-muted">
            {pct(c.score, c.total)}% com nota · {pct(c.unknown, c.total)}% não sei · {pct(c.missing, c.total)}% sem voto
          </p>
        </div>
        {unlinked > 0 && (
          <p className="text-xs text-subtle">
            {plural(unlinked, "membro ainda não escolheu", "membros ainda não escolheram")} o próprio jogador e não{" "}
            {unlinked === 1 ? "entra" : "entram"} na conta.
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          icon={ChartColumn}
          title="Distribuição das notas"
          description="Todos os votos dados aos jogadores ativos"
          table={<HistogramTable options={idx.options} values={stats.votes.map((v) => v.skill)} noun="Votos" />}
        >
          <NotaHistogram
            options={idx.options}
            noun={["voto", "votos"]}
            photos={false}
            listNames={false}
            units={stats.votes.map((v) => ({
              key: `${v.voter_id}-${v.player_id}`,
              name: idx.playerById.get(v.player_id)?.name ?? "",
              photo: null,
              value: v.skill,
            }))}
          />
        </ChartCard>

        <ChartCard icon={Users} title="Participação por votante" description="Toque em um votante para ver as notas dele">
          <Legend items={COVERAGE_LEGEND} />
          <div className="-mx-2 max-h-[340px] space-y-0.5 overflow-y-auto">
            {stats.perVoter.map(({ voter, coverage }) => (
              <button
                key={voter.user_id}
                type="button"
                onClick={() => onVoter(voter.user_id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,10rem)_1fr_auto]"
              >
                <span className="truncate text-sm font-medium text-fg">{voterName(voter)}</span>
                <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
                  <CoverageBar coverage={coverage} label={voterName(voter)} />
                </span>
                <span className="text-xs tabular text-muted sm:col-start-3 sm:row-start-1">
                  {coverage.score + coverage.unknown}/{coverage.total}
                </span>
              </button>
            ))}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankCard
          icon={ArrowLeftRight}
          title="Votação × nota atual"
          description="Maiores diferenças entre a média e a nota do sorteio"
          empty="Nenhuma diferença: as médias batem com as notas atuais."
          legend={[SCALE_LEGEND.current, SCALE_LEGEND.mean]}
          rows={stats.gaps.map((p) => {
            const delta = p.mean! - p.player.skill;
            return {
              id: p.player.id,
              name: p.player.name,
              photo: p.player.photo_url,
              figure: `${delta > 0 ? "+" : "−"}${fmtSkill(Math.round(Math.abs(delta) * 100) / 100)}`,
              detail: `${fmtSkill(p.player.skill)} → ${fmtSkill(Math.round(p.mean! * 100) / 100)}`,
              chart: <Dumbbell min={idx.min} max={idx.max} from={p.player.skill} to={p.mean!} />,
            };
          })}
          onRow={onPlayer}
        />
        <RankCard
          icon={Split}
          title="Opiniões mais divididas"
          description="Jogadores com as notas mais espalhadas"
          empty="Ainda não há jogadores com notas diferentes entre si."
          legend={[SCALE_LEGEND.vote, SCALE_LEGEND.mean]}
          rows={stats.divided.map((p) => ({
            id: p.player.id,
            name: p.player.name,
            photo: p.player.photo_url,
            figure: `${fmtSkill(p.min!)}–${fmtSkill(p.max!)}`,
            detail: plural(p.scores.length, "nota", "notas"),
            chart: (
              <RangeStrip
                compact
                min={idx.min}
                max={idx.max}
                values={p.scores.map((v) => v.skill as number)}
                mean={p.mean}
              />
            ),
          }))}
          onRow={onPlayer}
        />
        <RankCard
          icon={CircleQuestionMark}
          title="Menos conhecidos"
          description="Mais respostas “Não sei”"
          empty="Ninguém marcou “Não sei” ainda."
          rows={stats.unknown.map((p) => ({
            id: p.player.id,
            name: p.player.name,
            photo: p.player.photo_url,
            figure: String(p.unknown.length),
            detail: `de ${plural(p.coverage.total, "votante", "votantes")}`,
            chart: (
              <div className="h-2 rounded-r bg-viz-unknown" style={{ width: `${(p.unknown.length / mostUnknown) * 100}%` }} />
            ),
          }))}
          legend={[{ label: "Não sei", mark: <Swatch className="bg-viz-unknown" /> }]}
          onRow={onPlayer}
        />
      </div>
    </div>
  );
}

function RankCard({
  icon,
  title,
  description,
  empty,
  legend,
  rows,
  onRow,
}: {
  icon: typeof Users;
  title: string;
  description: string;
  empty: string;
  legend?: { label: string; mark: ReactNode }[];
  rows: { id: number; name: string; photo: string | null; figure: string; detail: string; chart: ReactNode }[];
  onRow: (id: number) => void;
}) {
  return (
    <ChartCard icon={icon} title={title} description={description}>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">{empty}</p>
      ) : (
        <>
          {legend && legend.length > 1 && <Legend items={legend} />}
          <div className="-mx-2 space-y-0.5">
            {rows.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onRow(r.id)}
                className={cx("w-full space-y-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-2")}
              >
                <span className="flex items-center gap-2">
                  <Avatar name={r.name} src={r.photo} size={24} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{r.name}</span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular text-fg">{r.figure}</span>
                  </span>
                </span>
                <span className="flex items-center gap-2 pl-8">
                  <span className="min-w-0 flex-1">{r.chart}</span>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular text-subtle">{r.detail}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </ChartCard>
  );
}
