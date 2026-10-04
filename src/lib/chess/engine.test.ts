import { describe, expect, it } from "vitest";
import { parseFen } from "./fen";
import {
  applyMove,
  findLegalMove,
  isSquareAttacked,
  legalMovesOf,
  positionKey,
} from "./position";
import {
  assertFenMatchesOracle,
  canonicalMoveId,
  diffMovesAgainstOracle,
  oracleMoveIds,
} from "./oracle";

// 本文件所有局面均已经 chess.js 独立核对。
// 格子编号：sq = rank*8 + file（e5=36, d6=43, f6=45, d5=35, d4=27）

describe("初始局面", () => {
  const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  it("有 20 个合法走子、未将军，且与 chess.js 完全一致", () => {
    const state = parseFen(START);
    const moves = legalMovesOf(state);
    expect(moves).toHaveLength(20);
    expect(isSquareAttacked(state.board, 4, "b")).toBe(false);
    expect(diffMovesAgainstOracle(state)).toBe("");
  });
});

describe("吃过路兵移除导致的透线将军", () => {
  // 白王 e1，黑车 e8，黑兵 d5、f5，白兵 e5，过路兵目标格 d6。
  // 白走 exd6 会把 e5 兵移走并吃掉 d5 兵，e 线被车 e8 打通照白王 → 非法。
  const PIN = "4r2k/8/8/3pPp2/8/8/8/4K3 w k d6 0 1";

  it("合法走子集合与 chess.js 一致（exd6 两边都判非法）", () => {
    const state = parseFen(PIN);
    expect(diffMovesAgainstOracle(state)).toBe("");
    expect(oracleMoveIds(PIN).has(canonicalMoveId({ from: 36, to: 43 }))).toBe(
      false,
    );
  });

  it("exd6 被判非法，且 d6 不作为“真正合法的过路兵机会”进入局面身份", () => {
    const state = parseFen(PIN);
    expect(findLegalMove(state, 36, 43)).toBeUndefined();
    expect(positionKey(state).split(" ")[3]).toBe("-");
  });

  it("同布局无论 FEN 是否挂着不可用的 d6 目标格，局面身份相同", () => {
    const unusable = parseFen(PIN);
    const cleared = parseFen("4r2k/8/8/3pPp2/8/8/8/4K3 w k - 0 1");
    expect(positionKey(unusable)).toBe(positionKey(cleared));
  });

  it("对照：安全局面下过路兵合法且进入身份键，走后 FEN 与 chess.js 一致", () => {
    // 黑兵 d7 双步 d5，白兵 e5，双方王分别在 h1/h8；ep 格 d6
    const before = parseFen("7k/3p4/8/4P3/8/8/8/K7 b - - 0 1");
    const dbl = findLegalMove(before, 51, 35); // d7=51 -> d5=35
    expect(dbl).toBeDefined();
    const after = applyMove(before, dbl!);
    expect(after.epSquare).toBe(43);

    const ep = findLegalMove(after, 36, 43)!;
    expect(ep.enPassant).toBe(true);
    expect(positionKey(after).split(" ")[3]).toBe("d6");
    expect(assertFenMatchesOracle(after, ep)).toBe("");
  });
});

describe("王车易位经过受攻击格", () => {
  // 黑车 f8 沿 f 线攻击 f1：白短易位经过 f1，非法；长易位仍合法。
  const THROUGH_F = "r3k2r/5r2/8/8/8/8/8/R3K2R w KQkq - 0 1";
  // 黑车 g8 攻击落子格 g1：短易位非法。
  const DEST_G = "r3k1r1/8/8/8/8/8/8/R3K2R w KQkq - 0 1";
  const FREE = "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1";

  it("f1 受攻击：不能短易位，长易位合法，集合与 chess.js 一致", () => {
    const state = parseFen(THROUGH_F);
    expect(findLegalMove(state, 4, 6)?.castle).toBeUndefined();
    expect(findLegalMove(state, 4, 2)?.castle).toBe("Q");
    expect(diffMovesAgainstOracle(state)).toBe("");
  });

  it("g1 落子格受攻击：不能短易位", () => {
    const state = parseFen(DEST_G);
    expect(findLegalMove(state, 4, 6)?.castle).toBeUndefined();
    expect(findLegalMove(state, 4, 2)?.castle).toBe("Q");
    expect(diffMovesAgainstOracle(state)).toBe("");
  });

  it("通畅局面短/长易位均合法，执行后 FEN 与 chess.js 一致", () => {
    const state = parseFen(FREE);
    const short = findLegalMove(state, 4, 6)!;
    const long = findLegalMove(state, 4, 2)!;
    expect(short.castle).toBe("K");
    expect(long.castle).toBe("Q");
    expect(assertFenMatchesOracle(state, short)).toBe("");
    expect(assertFenMatchesOracle(state, long)).toBe("");
  });

  it("被将军时完全不能易位", () => {
    // 黑车 e8 沿空 e 线直照 e1 白王：王只能躲，两侧易位全部非法
    const pos = parseFen("4r2k/8/8/8/8/8/8/R3K2R w KQ - 0 1");
    expect(findLegalMove(pos, 4, 6)?.castle).toBeUndefined();
    expect(findLegalMove(pos, 4, 2)?.castle).toBeUndefined();
    expect(diffMovesAgainstOracle(pos)).toBe("");
  });
});

describe("角上车被吃导致易位权丧失", () => {
  it("h1 车被黑后吃掉：白方王翼权丧失，其余保留，FEN 与 chess.js 一致", () => {
    const fen = "r3k2r/8/8/8/8/8/6pq/R3K2R b KQkq - 0 1";
    const state = parseFen(fen);
    const capture = findLegalMove(state, 15, 7)!; // 后 h2 -> h1
    expect(capture.capture).toBe("r");
    const after = applyMove(state, capture);
    expect(after.castling.K).toBe(false);
    expect(after.castling.Q).toBe(true);
    expect(after.castling.k).toBe(true);
    expect(after.castling.q).toBe(true);
    expect(assertFenMatchesOracle(state, capture)).toBe("");
  });

  it("a1 车被吃：仅白方后翼权丧失", () => {
    const fen = "r3k2r/8/8/8/8/8/q7/R3K2R b KQkq - 0 1";
    const state = parseFen(fen);
    const capture = findLegalMove(state, 8, 0)!; // 后 a2(=8) -> a1(=0)
    expect(capture.capture).toBe("r");
    const after = applyMove(state, capture);
    expect(after.castling.Q).toBe(false);
    expect(after.castling.K).toBe(true);
    expect(assertFenMatchesOracle(state, capture)).toBe("");
  });

  it("白王离开 e1：两侧权利同时丧失", () => {
    const state = parseFen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const kingMove = findLegalMove(state, 4, 12)!; // e1 -> e2 (12)
    const after = applyMove(state, kingMove);
    expect(after.castling.K).toBe(false);
    expect(after.castling.Q).toBe(false);
    expect(after.castling.k).toBe(true);
    expect(assertFenMatchesOracle(state, kingMove)).toBe("");
  });
});

describe("终局与升变", () => {
  it("学者杀：白方 0 合法走子且被将军（将死）", () => {
    // 1.f3 e5 2.g4 Qh4#
    const mate = parseFen(
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
    );
    expect(legalMovesOf(mate)).toHaveLength(0);
    expect(diffMovesAgainstOracle(mate)).toBe("");
  });

  it("经典逼和：黑王 a8 无子可动且不被将军", () => {
    const stale = parseFen("k7/1Q6/2K5/8/8/8/8/8 b - - 0 1");
    expect(legalMovesOf(stale)).toHaveLength(0);
    expect(diffMovesAgainstOracle(stale)).toBe("");
  });

  it("兵到底线生成后/车/象/马四种升变，且与 chess.js 一致", () => {
    const fen = "k7/4P3/8/8/8/8/8/4K3 w - - 0 1";
    const state = parseFen(fen);
    const moves = legalMovesOf(state).filter((m) => m.promotion);
    expect(moves.map((m) => m.promotion).sort()).toEqual(["b", "n", "q", "r"]);
    expect(diffMovesAgainstOracle(state)).toBe("");
    const queen = moves.find((m) => m.promotion === "q")!;
    expect(assertFenMatchesOracle(state, queen)).toBe("");
  });

  it("吃过路兵升变不存在（底线吃子只可能是普通吃子），普通斜吃升变正常", () => {
    // 白兵 a7，b8 有黑马：axb8 可升变四种（b8 必须是兵的斜前方且非升变空格）
    const fen = "1n5k/P7/8/8/8/8/8/4K3 w - - 0 1";
    const state = parseFen(fen);
    const diff = diffMovesAgainstOracle(state);
    expect(diff, diff).toBe("");
    const promoCaptures = legalMovesOf(state).filter(
      (m) => m.promotion && m.capture === "n",
    );
    expect(promoCaptures).toHaveLength(4);
  });
});
