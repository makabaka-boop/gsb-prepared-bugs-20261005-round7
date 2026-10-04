import { Chess } from "chess.js";
import type { Move, PositionState } from "./types";
import { parseFen, toFen } from "./fen";
import { legalMovesOf, positionKey, applyMove } from "./position";
import { squareName } from "./types";

/** 走子稳定标识：起-终-升变 */
export function canonicalMoveId(m: {
  from: number;
  to: number;
  promotion?: string;
}): string {
  return `${m.from}>${m.to}>${m.promotion ?? ""}`;
}

export function ourMoveIds(state: PositionState): Set<string> {
  return new Set(legalMovesOf(state).map((m) => canonicalMoveId(m)));
}

export function oracleMoveIds(fen: string): Set<string> {
  const chess = new Chess(fen);
  return new Set(
    chess.moves({ verbose: true }).map((m) => {
      const from = parseSquare(m.from);
      const to = parseSquare(m.to);
      return canonicalMoveId({ from, to, promotion: m.promotion });
    }),
  );
}

export function parseSquare(name: string): number {
  const f = name.charCodeAt(0) - 97;
  const r = Number(name[1]) - 1;
  return r * 8 + f;
}

/** 对比我方合法走子集合与 chess.js，返回差异描述（空字符串表示一致） */
export function diffMovesAgainstOracle(state: PositionState): string {
  const ours = ourMoveIds(state);
  const theirs = oracleMoveIds(toFen(state));
  const missing: string[] = [];
  const extra: string[] = [];
  for (const id of theirs) {
    if (!ours.has(id)) missing.push(prettyId(id));
  }
  for (const id of ours) {
    if (!theirs.has(id)) extra.push(prettyId(id));
  }
  if (!missing.length && !extra.length) return "";
  return `缺少[${missing.join(", ")}] 多出[${extra.join(", ")}]`;
}

function prettyId(id: string): string {
  const [from, to, promo] = id.split(">");
  return `${squareName(Number(from))}${squareName(Number(to))}${promo ? "=" + promo.toUpperCase() : ""}`;
}

/**
 * 应用我方走子后与 chess.js 的 FEN 前四域比较。
 * 过路兵格按 FIDE 规则归一：当 chess.js 中没有合法的吃过路兵走子时记为 '-'。
 */
export function assertFenMatchesOracle(
  state: PositionState,
  move: Move,
): string {
  const next = applyMove(state, move);
  const ourFen = positionKey(next);

  const chess = new Chess(toFen(state));
  chess.move({
    from: squareName(move.from),
    to: squareName(move.to),
    promotion: move.promotion,
  });
  const oracleFen = normalizeOracleFen(chess.fen());

  return ourFen === oracleFen
    ? ""
    : `FEN 不一致: 我方=${ourFen} 对照=${oracleFen}`;
}

/** 将 chess.js FEN 的过路兵格按“是否存在合法 ep 吃子”归一 */
export function normalizeOracleFen(fen: string): string {
  const parts = fen.split(" ");
  if (parts[3] !== "-") {
    const chess = new Chess(fen);
    const epMoves = chess
      .moves({ verbose: true })
      .filter((m) => m.flags.includes("e"));
    if (epMoves.length === 0) parts[3] = "-";
  }
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
}

export { canonicalMoveId as moveIdOf };
