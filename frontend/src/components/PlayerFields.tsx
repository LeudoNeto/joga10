import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { squarePhoto } from "../lib/image";
import { POSITIONS } from "../lib/format";
import type { Player } from "../types";
import { Avatar, Button, Input } from "./ui";

/** Pending photo change: a new image, a removal, or nothing. */
export type PhotoChange = { kind: "set"; blob: Blob } | { kind: "remove" } | null;

export function PhotoPicker({
  name,
  currentUrl,
  value,
  onChange,
  onError,
}: {
  name: string;
  currentUrl: string | null;
  value: PhotoChange;
  onChange: (change: PhotoChange) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (value?.kind !== "set") {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const shown = value?.kind === "remove" ? null : preview ?? currentUrl;

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError("Escolha um arquivo de imagem (JPG, PNG ou WEBP).");
      return;
    }
    try {
      onChange({ kind: "set", blob: await squarePhoto(file) });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Falha ao ler a imagem");
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name || "?"} src={shown} size={72} />
      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="secondary" icon={Camera} onClick={() => fileRef.current?.click()}>
          {shown ? "Trocar foto" : "Adicionar foto"}
        </Button>
        {shown && (
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => onChange({ kind: "remove" })}>
            Remover
          </Button>
        )}
        <p className="w-full text-xs text-subtle">Opcional. A imagem é recortada em formato quadrado.</p>
      </div>
    </div>
  );
}

/** Apply a pending photo change to a saved player. */
export async function savePhoto(groupId: number, playerId: number, change: PhotoChange): Promise<Player | null> {
  if (!change) return null;
  const path = `/groups/${groupId}/players/${playerId}/photo`;
  if (change.kind === "remove") return api.del<Player>(path);
  const form = new FormData();
  form.append("file", change.blob, "foto.jpg");
  return api.postForm<Player>(path, form);
}

export function PositionInput({
  value,
  onChange,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list="joga10-positions"
        maxLength={50}
        placeholder="Ex: Goleiro, Zagueiro, Meia, Atacante..."
        autoFocus={autoFocus}
      />
      <datalist id="joga10-positions">
        {POSITIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </>
  );
}
