// Runs the balancing search off the main thread so the UI stays responsive
// during the optimal search (as in team-balance).
import { solveSync, type Candidato } from "./balance";

interface Job {
  scores: number[];
  candidatos: Candidato[];
  algoritmo: "otimo" | "heuristico";
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<Job>) => void) | null;
  postMessage: (message: unknown) => void;
};

ctx.onmessage = (e) => {
  const { scores, candidatos, algoritmo } = e.data;
  ctx.postMessage(solveSync(scores, candidatos, algoritmo));
};
