import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ClipboardPaste, FileSpreadsheet, ListChecks, Plus, UserPlus } from "lucide-react";
import { api } from "../../api/client";
import type { GroupSummary, NameMatchResult, NameMatchRow, Player } from "../../types";
import { PositionInput } from "../../components/PlayerFields";
import { Alert, Badge, Button, Field, IconButton, Input, Modal, Segmented, Select, Textarea } from "../../components/ui";
import { errorMessage, fmtSkill, plural } from "../../lib/format";
import { parseVote } from "../../lib/votes";
import { FilePicker } from "../group/ImportPlayersModal";
import type { EventCtx } from "../EventPage";

const SAMPLE = `Pelada de quinta — confirmados
1. Neto ✅
2. Pedro Vital
3) Igor
- Cauã`;

/** How the server matched the name, kept up to date with what is picked since. */
type RowState = NameMatchRow["status"] | "chosen" | "created";

const STATUS: Record<RowState, { label: string; tone: "green" | "amber" | "brand" | "neutral" | "blue" }> = {
  matched: { label: "encontrado", tone: "green" },
  similar: { label: "parecido", tone: "amber" },
  ambiguous: { label: "escolha um", tone: "amber" },
  not_found: { label: "não encontrado", tone: "brand" },
  duplicate: { label: "repetido", tone: "neutral" },
  chosen: { label: "escolhido", tone: "green" },
  created: { label: "novo", tone: "blue" },
};

export function ImportSelectionModal({
  open,
  ctx,
  onClose,
  onApply,
}: {
  open: boolean;
  ctx: EventCtx;
  onClose: () => void;
  onApply: (playerIds: number[], replace: boolean) => void;
}) {
  const { group, players, isAdmin } = ctx;
  const [method, setMethod] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<NameMatchResult | null>(null);
  const [picks, setPicks] = useState<(number | null)[]>([]); // player chosen for each row
  const [added, setAdded] = useState<Player[]>([]); // registered here, maybe not in ctx.players yet
  const [creating, setCreating] = useState<number | null>(null); // row registering a new player
  const [replace, setReplace] = useState<"replace" | "add">("replace");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setError(null);
    setPicks([]);
    setAdded([]);
    setCreating(null);
  }, [open]);

  async function analyze() {
    setError(null);
    const form = new FormData();
    if (method === "text") {
      if (!text.trim()) return setError("Cole a lista de nomes.");
      form.append("text", text);
    } else {
      if (!file) return setError("Selecione um arquivo.");
      form.append("file", file);
    }
    setBusy(true);
    try {
      const res = await api.postForm<NameMatchResult>(`/groups/${group.id}/players/match-names`, form);
      setResult(res);
      setPicks(res.rows.map((r) => r.player_id));
      if (!res.rows.length) setError("Nenhum nome reconhecido.");
    } catch (err) {
      setError(errorMessage(err, "Falha ao ler a lista"));
    } finally {
      setBusy(false);
    }
  }

  const roster = useMemo(() => {
    const known = new Set(players.map((p) => p.id));
    return [...players, ...added.filter((p) => !known.has(p.id))].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [players, added]);

  const states = useMemo(() => {
    const seen = new Set<number>();
    const created = new Set(added.map((p) => p.id));
    return (result?.rows ?? []).map((r, i): RowState => {
      const id = picks[i];
      if (id == null) return r.status === "not_found" ? "not_found" : "ambiguous";
      if (seen.has(id)) return "duplicate";
      seen.add(id);
      if (created.has(id)) return "created";
      if (id === r.player_id) return r.status === "similar" ? "similar" : "matched";
      return "chosen";
    });
  }, [result, picks, added]);

  const pickCount = useMemo(() => {
    const count = new Map<number, number>();
    for (const id of picks) if (id != null) count.set(id, (count.get(id) ?? 0) + 1);
    return count;
  }, [picks]);

  const picked = [...pickCount.keys()];
  const unpicked = picks.filter((id) => id == null).length;

  const pick = (row: number, id: number | null) => setPicks((prev) => prev.map((v, i) => (i === row ? id : v)));

  function handleCreated(row: number, player: Player) {
    setAdded((prev) => [...prev, player]);
    pick(row, player.id);
    setCreating(null);
    ctx.reloadPlayers().catch(() => undefined); // retried when applying
  }

  async function apply() {
    setError(null);
    const known = new Set(players.map((p) => p.id));
    if (picked.some((id) => !known.has(id))) {
      // The draw only counts players it knows: fetch the ones registered here.
      setBusy(true);
      try {
        await ctx.reloadPlayers();
      } catch (err) {
        return setError(errorMessage(err, "Falha ao atualizar a lista de jogadores"));
      } finally {
        setBusy(false);
      }
    }
    onApply(picked, replace === "replace");
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Importar jogadores selecionados"
        description="Cole a lista de confirmados (ex.: do WhatsApp): só os nomes importam — numeração, emojis e notas são ignorados."
        icon={ListChecks}
        size="lg"
      >
        <div className="space-y-4">
          {error && <Alert>{error}</Alert>}

          {!result ? (
            <>
              <Segmented
                value={method}
                onChange={setMethod}
                className="w-full"
                options={[
                  { value: "text", label: "Colar lista", icon: ClipboardPaste },
                  { value: "file", label: "Arquivo", icon: FileSpreadsheet },
                ]}
              />
              {method === "text" ? (
                <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} placeholder={SAMPLE} className="font-mono" />
              ) : (
                <FilePicker
                  file={file}
                  onPick={setFile}
                  inputRef={fileRef}
                  hint={
                    <>
                      <strong>.txt</strong>: um nome por linha. <strong>.csv / .xls / .xlsx</strong>: coluna{" "}
                      <span className="font-mono">Nome</span> (ou a primeira coluna).
                    </>
                  }
                />
              )}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={onClose}>
                  Cancelar
                </Button>
                <Button onClick={analyze} loading={busy}>
                  Analisar lista
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-line">
                <div className="sticky top-0 z-10 hidden grid-cols-2 gap-3 border-b border-line bg-surface-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-subtle sm:grid">
                  <span>Na lista</span>
                  <span>Jogador do grupo</span>
                </div>
                <ul className="divide-y divide-line">
                  {result.rows.map((r, i) => {
                    const suggested = new Set(r.candidates.map((c) => c.id));
                    // Players picked by another row go last: the missing ones are usually among the rest.
                    const elsewhere = (p: Player) => (pickCount.get(p.id) ?? 0) > (picks[i] === p.id ? 1 : 0);
                    const rest = roster.filter((p) => !suggested.has(p.id));
                    return (
                      <li key={i} className="grid gap-2 px-3 py-2.5 sm:grid-cols-2 sm:items-center sm:gap-3">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="min-w-0 break-words text-sm text-fg">{r.input}</span>
                          <Badge tone={STATUS[states[i]].tone}>{STATUS[states[i]].label}</Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="min-w-0 flex-1">
                            <Select
                              value={picks[i] ?? ""}
                              onChange={(e) => pick(i, e.target.value ? Number(e.target.value) : null)}
                              aria-label={`Jogador do grupo para ${r.input}`}
                            >
                              <option value="">Escolha o jogador...</option>
                              <PlayerOptions label="Sugestões" players={roster.filter((p) => suggested.has(p.id))} />
                              <PlayerOptions label="Jogadores" players={rest.filter((p) => !elsewhere(p))} />
                              <PlayerOptions label="Já escolhidos" players={rest.filter(elsewhere)} />
                            </Select>
                          </div>
                          {isAdmin && (
                            <IconButton icon={Plus} label="Cadastrar jogador" variant="secondary" onClick={() => setCreating(i)} />
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {unpicked > 0 && (
                <p className="text-xs text-subtle">
                  {plural(unpicked, "nome sem jogador fica", "nomes sem jogador ficam")} de fora da seleção.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Segmented
                  size="sm"
                  value={replace}
                  onChange={setReplace}
                  options={[
                    { value: "replace", label: "Substituir seleção" },
                    { value: "add", label: "Adicionar à seleção" },
                  ]}
                />
                <div className="flex gap-2">
                  <Button variant="secondary" icon={ArrowLeft} onClick={() => setResult(null)} disabled={busy}>
                    Voltar
                  </Button>
                  <Button onClick={apply} loading={busy} disabled={picked.length === 0}>
                    Selecionar {picked.length} jogador(es)
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {open && result && creating !== null && (
        <NewPlayerModal
          name={result.rows[creating].input}
          group={group}
          onClose={() => setCreating(null)}
          onCreated={(player) => handleCreated(creating, player)}
        />
      )}
    </>
  );
}

function PlayerOptions({ label, players }: { label: string; players: Player[] }) {
  if (!players.length) return null;
  return (
    <optgroup label={label}>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.active ? p.name : `${p.name} (inativo)`}
        </option>
      ))}
    </optgroup>
  );
}

/** Registers a name of the list as a player of the group: nota required, position optional. */
function NewPlayerModal({
  name: listName,
  group,
  onClose,
  onCreated,
}: {
  name: string;
  group: GroupSummary;
  onClose: () => void;
  onCreated: (player: Player) => void;
}) {
  const [name, setName] = useState(listName);
  const [skill, setSkill] = useState("");
  const [position, setPosition] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { min_skill: min, max_skill: max } = group;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Informe o nome do jogador.");
    const value = parseVote(skill, min, max);
    if (value === null) return setError(`Informe a nota, de ${fmtSkill(min)} a ${fmtSkill(max)}.`);
    setBusy(true);
    setError(null);
    try {
      const player = await api.post<Player>(`/groups/${group.id}/players`, {
        name: name.trim(),
        position: position.trim() || null,
        skill: value,
        active: true,
      });
      onCreated(player);
    } catch (err) {
      setError(errorMessage(err, "Falha ao cadastrar jogador"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Cadastrar jogador"
      description="O jogador entra no grupo e já fica escolhido na lista."
      icon={UserPlus}
      size="sm"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nome">
          <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </Field>
        <Field label="Nota de habilidade" hint={`Faixa do grupo: ${fmtSkill(min)} a ${fmtSkill(max)}`}>
          <Input
            type="text"
            inputMode="decimal"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            required
            autoFocus
            className="tabular"
          />
        </Field>
        <Field label="Posição (opcional)">
          <PositionInput value={position} onChange={setPosition} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" icon={UserPlus} loading={busy}>
            Cadastrar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
