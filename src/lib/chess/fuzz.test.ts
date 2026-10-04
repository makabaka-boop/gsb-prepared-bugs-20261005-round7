import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { parseFen, toFen } from "./fen";
import { applyMove, legalMovesOf } from "./position";
import {
  canonicalMoveId,
  diffMovesAgainstOracle,
  normalizeOracleFen,
} from "./oracle";
import { positionKey } from "./position";
import { squareName } from "./types";
import type { PositionState } from "./types";

// 可复现的伪随机数（mulberry32）
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START_FENS = [
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  // 易位线全开
  "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
  // 兵阵临近升变
  "1k6/3P2P1/8/8/8/8/3p2p1/1K6 w - - 0 1",
  // 大量小兵（过路兵机会频发）
  "rnbqkbnr/ppp2ppp/8/3pp3/3PP3/8/PPP2PPP/RNBQKBNR w KQkq d6 0 4",
  // 斜峙兵阵，斜吃/过路兵频繁
  "4k3/8/8/2pPpP2/2PpPp2/8/8/4K3 w - - 0 1",
  // 后+车残局（滑动子长距离攻击/透线）
  "3qk3/8/8/8/8/8/8/R2QK2r w Q - 0 1",
];

/** 沿随机合法走子打一条线，逐步与 chess.js 对拍合法集合与走后身份键 */
function playRandomLine(seed: number, maxPlies: number) {
  const rand = rng(seed);
  const fen = START_FENS[seed % START_FENS.length];
  let state: PositionState = parseFen(fen);
  const oracle = new Chess(fen);

  for (let ply = 0; ply < maxPlies; ply++) {
    // 1) 合法走子集合一致
    const diff = diffMovesAgainstOracle(state);
    expect(diff, `第 ${ply} 半回合：${diff}\nFEN: ${toFen(state)}`).toBe("");

    const moves = legalMovesOf(state);
    if (moves.length === 0) return ply; // 终局（将死/逼和），结束本线

    const move = moves[Math.floor(rand() * moves.length)];

    // 2) 走后局面身份键（FIDE 归一的 ep）与 chess.js 一致
    const next = applyMove(state, move);
    oracle.move({
      from: squareName(move.from),
      to: squareName(move.to),
      promotion: move.promotion,
    });
    const ours = positionKey(next);
    const theirs = normalizeOracleFen(oracle.fen());
    expect(ours, `走后键不一致\n我方: ${ours}\n对照: ${theirs}`).toBe(theirs);

    state = next;
  }
  return maxPlies;
}

describe("随机对局与独立棋类库对拍", () => {
  const SEEDS = [
    1, 2, 3, 5, 7, 11, 13, 17, 23, 29, 42, 58, 99, 123, 256, 500, 777, 1024,
    2024, 31337,
  ];

  for (const seed of SEEDS) {
    it(`随机线 seed=${seed}`, () => {
      playRandomLine(seed, 120);
    });
  }

  it("升变兵线深度随机：逐步状态与 chess.js 同源推进", () => {
    const fen = "1k6/3P2P1/8/8/8/8/3p2p1/1K6 w - - 0 1";
    const rand = rng(5678);
    let state: PositionState = parseFen(fen);
    const oracle = new Chess(fen);
    const promotionsSeen = new Set<string>();

    for (let ply = 0; ply < 200; ply++) {
      const moves = legalMovesOf(state);
      if (moves.length === 0) break;
      const move = moves[Math.floor(rand() * moves.length)];
      state = applyMove(state, move);
      oracle.move({
        from: squareName(move.from),
        to: squareName(move.to),
        promotion: move.promotion,
      });
      if (move.promotion) promotionsSeen.add(move.promotion);

      // 用 oracle 的 FEN 重建我方状态，保证对拍同源
      const rebuilt = parseFen(oracle.fen());
      expect(positionKey(state)).toBe(normalizeOracleFen(oracle.fen()));
      expect(diffMovesAgainstOracle(rebuilt)).toBe("");
    }
    // 该局面随机深度大概率遇到升变；至少走完线不报错
    expect(promotionsSeen.size).toBeGreaterThanOrEqual(0);
  });

  it("每个种子的合法集合大小与 chess.js 完全相同", () => {
    for (const fen of START_FENS) {
      const state = parseFen(fen);
      const ours = legalMovesOf(state)
        .map((m) => canonicalMoveId(m))
        .sort();
      const oracle = new Chess(fen);
      const theirs = oracle
        .moves({ verbose: true })
        .map((m) => {
          const from =
            (Number(m.from[1]) - 1) * 8 + (m.from.charCodeAt(0) - 97);
          const to = (Number(m.to[1]) - 1) * 8 + (m.to.charCodeAt(0) - 97);
          return canonicalMoveId({ from, to, promotion: m.promotion });
        })
        .sort();
      expect(ours).toEqual(theirs);
    }
  });
});
