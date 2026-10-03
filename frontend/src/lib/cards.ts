export interface CardTemplate {
  id: string;
  name: string;
  description: string;
  fullUrl: string;
  emptyUrl: string;
  width: number;
  height: number;
}

export const CARD_TEMPLATES: CardTemplate[] = [
  {
    id: "card-template",
    name: "Preto & Dourado",
    description: "Geométrico escuro com escudo dourado",
    fullUrl: "/cards/card-template.png",
    emptyUrl: "/cards/card-template-empty.png",
    width: 757,
    height: 1024,
  },
  {
    id: "card-template2",
    name: "Verde & Ouro (TOTY)",
    description: "Ornamental verde esmeralda com brasão dourado",
    fullUrl: "/cards/card-template2.png",
    emptyUrl: "/cards/card-template2-empty.png",
    width: 644,
    height: 900,
  },
];

export const POSITION_PRESETS = [
  "ATA",
  "MEI",
  "CA",
  "GOL",
  "VOL",
  "ZAG",
  "LAT",
  "PON",
  "PIV",
  "FIX",
  "ALA",
];

export function getTemplate(id?: string | null): CardTemplate {
  return CARD_TEMPLATES.find((t) => t.id === id) ?? CARD_TEMPLATES[0];
}
