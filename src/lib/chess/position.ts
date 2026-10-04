import type {
  Board,
  CastlingRights,
  Color,
  Move,
  Piece,
  PieceType,
  Position,
  PositionState,
} from "./types";
import { fileOf, opponent, rankOf, squareName, sq } from "./types";

const KNIGHT_DELTAS = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];

const KING_DELTAS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

const BISHOP_DIRS = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ROOK_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function initialBoard(): Board {
  const board: Board = new Array(64).fill(null);
  const back: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];
  for (let file = 0; file < 8; file++) {
    board[sq(file, 0)] = { color: "w", type: back[file] };
    board[sq(file, 1)] = { color: "w", type: "p" };
    board[sq(file, 6)] = { color: "b", type: "p" };
    board[sq(file, 7)] = { color: "b", type: back[file] };
  }
  return board;
}

export function initialState(): PositionState {
  return {
    board: initialBoard(),
    turn: "w",
    castling: { K: true, Q: true, k: true, q: true },
    epSquare: null,
  };
}

export function cloneState(state: PositionState): PositionState {
  return {
    board: state.board.slice(),
    turn: state.turn,
    castling: { ...state.castling },
    epSquare: state.epSquare,
  };
}

function onBoard(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

/** `square` 是否受到 byColor 方棋子的攻击（王车易位判经过格时与王是否在场无关） */
export function isSquareAttacked(
  board: Board,
  square: number,
  byColor: Color,
): boolean {
  const f = fileOf(square);
  const r = rankOf(square);

  // 兵：攻击者位于兵的前进反方向
  const pawnDir = byColor === "w" ? 1 : -1;
  for (const df of [-1, 1]) {
    const of = f + df;
    const or = r - pawnDir;
    if (onBoard(of, or)) {
      const p = board[sq(of, or)];
      if (p && p.color === byColor && p.type === "p") return true;
    }
  }

  // 马
  for (const [df, dr] of KNIGHT_DELTAS) {
    const of = f + df;
    const or2 = r + dr;
    if (onBoard(of, or2)) {
      const p = board[sq(of, or2)];
      if (p && p.color === byColor && p.type === "n") return true;
    }
  }

  // 王
  for (const [df, dr] of KING_DELTAS) {
    const of = f + df;
    const or2 = r + dr;
    if (onBoard(of, or2)) {
      const p = board[sq(of, or2)];
      if (p && p.color === byColor && p.type === "k") return true;
    }
  }

  // 滑动子：象 / 后（斜）
  for (const [df, dr] of BISHOP_DIRS) {
    let of = f + df;
    let or2 = r + dr;
    while (onBoard(of, or2)) {
      const p = board[sq(of, or2)];
      if (p) {
        if (p.color === byColor && (p.type === "b" || p.type === "q"))
          return true;
        break;
      }
      of += df;
      or2 += dr;
    }
  }

  // 滑动子：车 / 后（直）
  for (const [df, dr] of ROOK_DIRS) {
    let of = f + df;
    let or2 = r + dr;
    while (onBoard(of, or2)) {
      const p = board[sq(of, or2)];
      if (p) {
        if (p.color === byColor && (p.type === "r" || p.type === "q"))
          return true;
        break;
      }
      of += df;
      or2 += dr;
    }
  }

  return false;
}

export function findKing(board: Board, color: Color): number | null {
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p.color === color && p.type === "k") return i;
  }
  return null;
}

export function isInCheck(
  state: PositionState,
  color: Color = state.turn,
): boolean {
  const kingSq = findKing(state.board, color);
  if (kingSq === null) return false;
  return isSquareAttacked(state.board, kingSq, opponent(color));
}

const PROMOTIONS: Exclude<PieceType, "p" | "k">[] = ["q", "r", "b", "n"];

function pushPawnMoves(
  state: PositionState,
  moves: Move[],
  from: number,
): void {
  const board = state.board;
  const color = state.turn;
  const dir = color === "w" ? 1 : -1;
  const startRank = color === "w" ? 1 : 6;
  const promoRank = color === "w" ? 7 : 0;
  const f = fileOf(from);
  const r = rankOf(from);
  const enemy = opponent(color);

  const addPawn = (to: number, capture: PieceType | undefined, ep: boolean) => {
    if (rankOf(to) === promoRank) {
      for (const promotion of PROMOTIONS) {
        moves.push({
          from,
          to,
          piece: "p",
          color,
          capture,
          promotion,
          enPassant: ep || undefined,
        });
      }
    } else {
      moves.push({
        from,
        to,
        piece: "p",
        color,
        capture,
        enPassant: ep || undefined,
      });
    }
  };

  // 单步前进
  const oneR = r + dir;
  if (onBoard(f, oneR) && board[sq(f, oneR)] === null) {
    addPawn(sq(f, oneR), undefined, false);
    // 双步前进
    if (r === startRank) {
      const twoR = r + 2 * dir;
      if (board[sq(f, twoR)] === null) {
        moves.push({ from, to: sq(f, twoR), piece: "p", color });
      }
    }
  }

  // 斜吃与吃过路兵
  for (const df of [-1, 1]) {
    const tf = f + df;
    if (!onBoard(tf, oneR)) continue;
    const to = sq(tf, oneR);
    const target = board[to];
    if (target && target.color === enemy) {
      addPawn(to, target.type, false);
    } else if (to === state.epSquare) {
      // 被吃的兵位于目标格的后退一格
      const capturedSq = sq(tf, r);
      const captured = board[capturedSq];
      if (captured && captured.color === enemy && captured.type === "p") {
        addPawn(to, "p", true);
      }
    }
  }
}

function pushStepMoves(
  state: PositionState,
  moves: Move[],
  from: number,
  type: "n" | "k",
  deltas: number[][],
): void {
  const board = state.board;
  const color = state.turn;
  const f = fileOf(from);
  const r = rankOf(from);
  for (const [df, dr] of deltas) {
    const tf = f + df;
    const tr = r + dr;
    if (!onBoard(tf, tr)) continue;
    const to = sq(tf, tr);
    const target = board[to];
    if (!target) {
      moves.push({ from, to, piece: type, color });
    } else if (target.color !== color) {
      moves.push({ from, to, piece: type, color, capture: target.type });
    }
  }
}

function pushSlidingMoves(
  state: PositionState,
  moves: Move[],
  from: number,
  type: "b" | "r" | "q",
  dirs: number[][],
): void {
  const board = state.board;
  const color = state.turn;
  const f = fileOf(from);
  const r = rankOf(from);
  for (const [df, dr] of dirs) {
    let tf = f + df;
    let tr = r + dr;
    while (onBoard(tf, tr)) {
      const to = sq(tf, tr);
      const target = board[to];
      if (!target) {
        moves.push({ from, to, piece: type, color });
      } else {
        if (target.color !== color) {
          moves.push({ from, to, piece: type, color, capture: target.type });
        }
        break;
      }
      tf += df;
      tr += dr;
    }
  }
}

function pushCastlingMoves(state: PositionState, moves: Move[]): void {
  if (isInCheck(state)) return; // 被将军时不能易位
  const board = state.board;
  const enemy = opponent(state.turn);
  const attacked = (square: number) => isSquareAttacked(board, square, enemy);
  const isRook = (square: number) => {
    const p = board[square];
    return !!p && p.color === state.turn && p.type === "r";
  };

  if (state.turn === "w") {
    if (
      state.castling.K &&
      board[4]?.type === "k" &&
      isRook(7) &&
      board[5] === null &&
      board[6] === null &&
      !attacked(4) &&
      !attacked(5) &&
      !attacked(6)
    ) {
      moves.push({ from: 4, to: 6, piece: "k", color: "w", castle: "K" });
    }
    if (
      state.castling.Q &&
      board[4]?.type === "k" &&
      isRook(0) &&
      board[3] === null &&
      board[2] === null &&
      board[1] === null &&
      !attacked(4) &&
      !attacked(3) &&
      !attacked(2)
    ) {
      moves.push({ from: 4, to: 2, piece: "k", color: "w", castle: "Q" });
    }
  } else {
    if (
      state.castling.k &&
      board[60]?.type === "k" &&
      isRook(63) &&
      board[61] === null &&
      board[62] === null &&
      !attacked(60) &&
      !attacked(61) &&
      !attacked(62)
    ) {
      moves.push({ from: 60, to: 62, piece: "k", color: "b", castle: "k" });
    }
    if (
      state.castling.q &&
      board[60]?.type === "k" &&
      isRook(56) &&
      board[59] === null &&
      board[58] === null &&
      board[57] === null &&
      !attacked(60) &&
      !attacked(59) &&
      !attacked(58)
    ) {
      moves.push({ from: 60, to: 58, piece: "k", color: "b", castle: "q" });
    }
  }
}

/** 伪合法走子（不含王安全过滤，易位在此处做完整经过格检查） */
export function generatePseudoMoves(state: PositionState): Move[] {
  const moves: Move[] = [];
  for (let from = 0; from < 64; from++) {
    const p = state.board[from];
    if (!p || p.color !== state.turn) continue;
    switch (p.type) {
      case "p":
        pushPawnMoves(state, moves, from);
        break;
      case "n":
        pushStepMoves(state, moves, from, "n", KNIGHT_DELTAS);
        break;
      case "k":
        pushStepMoves(state, moves, from, "k", KING_DELTAS);
        break;
      case "b":
        pushSlidingMoves(state, moves, from, "b", BISHOP_DIRS);
        break;
      case "r":
        pushSlidingMoves(state, moves, from, "r", ROOK_DIRS);
        break;
      case "q":
        pushSlidingMoves(state, moves, from, "q", [
          ...BISHOP_DIRS,
          ...ROOK_DIRS,
        ]);
        break;
    }
  }
  pushCastlingMoves(state, moves);
  return moves;
}

/** 执行走子（假定合法），返回全新局面状态 */
export function applyMove(state: PositionState, move: Move): PositionState {
  const next = cloneState(state);
  const board = next.board;
  const piece = board[move.from];
  if (!piece) return next;

  board[move.from] = null;

  if (move.enPassant) {
    // 被吃过路兵：与起点同横线、与目标格同列
    board[sq(fileOf(move.to), rankOf(move.from))] = null;
  }

  board[move.to] = move.promotion
    ? { color: move.color, type: move.promotion }
    : { color: move.color, type: piece.type };

  if (move.castle) {
    // 同时移动车
    if (move.castle === "K") {
      board[7] = null;
      board[5] = { color: "w", type: "r" };
    } else if (move.castle === "Q") {
      board[0] = null;
      board[3] = { color: "w", type: "r" };
    } else if (move.castle === "k") {
      board[63] = null;
      board[61] = { color: "b", type: "r" };
    } else {
      board[56] = null;
      board[59] = { color: "b", type: "r" };
    }
  }

  // 易位权更新：起点或终点落在底线特殊格时删除相应权利
  // 同时覆盖王移动、车移动、车被吃三种情况
  const RIGHTS_BY_SQUARE: Partial<Record<number, (keyof CastlingRights)[]>> = {
    0: ["Q"],
    4: ["K", "Q"],
    7: ["K"],
    56: ["q"],
    60: ["k", "q"],
    63: ["k"],
  };
  for (const square of [move.from, move.to]) {
    for (const right of RIGHTS_BY_SQUARE[square] ?? []) {
      next.castling[right] = false;
    }
  }

  // 过路兵目标格：仅兵双步前进时设置
  next.epSquare =
    piece.type === "p" && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2
      ? (move.from + move.to) / 2
      : null;

  next.turn = opponent(state.turn);
  return next;
}

/** 走子后自己的王不能暴露 */
export function moveLeavesKingSafe(state: PositionState, move: Move): boolean {
  const next = applyMove(state, move);
  const kingSq = findKing(next.board, state.turn);
  if (kingSq === null) return false;
  return !isSquareAttacked(next.board, kingSq, opponent(state.turn));
}

export function legalMovesOf(state: PositionState): Move[] {
  return generatePseudoMoves(state).filter((m) => moveLeavesKingSafe(state, m));
}

export function findLegalMove(
  state: PositionState,
  from: number,
  to: number,
  promotion?: Move["promotion"],
): Move | undefined {
  return legalMovesOf(state).find(
    (m) =>
      m.from === from &&
      m.to === to &&
      (m.promotion ?? undefined) === promotion,
  );
}

/**
 * 局面身份键（FIDE 2017 规则）：
 * 同兵种同色棋子布局 + 行棋方 + 易位权 + 过路兵目标格。
 * 关键：过路兵格仅当存在“真正合法”的吃过路兵走子时才计入身份；
 * 仅有目标格但因王暴露而不能吃时，不产生额外局面身份。
 */
export function positionKey(state: PositionState, legalMoves?: Move[]): string {
  const moves = legalMoves ?? legalMovesOf(state);
  let rows = "";
  for (let r = 7; r >= 0; r--) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p: Piece | null = state.board[sq(f, r)];
      if (!p) {
        empty++;
      } else {
        if (empty) {
          rows += String(empty);
          empty = 0;
        }
        const letter = p.type;
        rows += p.color === "w" ? letter.toUpperCase() : letter;
      }
    }
    if (empty) rows += String(empty);
    if (r > 0) rows += "/";
  }

  let cr = "";
  if (state.castling.K) cr += "K";
  if (state.castling.Q) cr += "Q";
  if (state.castling.k) cr += "k";
  if (state.castling.q) cr += "q";
  if (!cr) cr = "-";

  const epUsable =
    state.epSquare !== null &&
    moves.some((m) => m.enPassant && m.to === state.epSquare);
  const epField = epUsable ? squareName(state.epSquare as number) : "-";

  return `${rows} ${state.turn} ${cr} ${epField}`;
}

/** 汇总局面：合法走子、将军状态与身份键 */
export function evaluatePosition(state: PositionState): Position {
  const legalMoves = legalMovesOf(state);
  return {
    ...state,
    legalMoves,
    inCheck: isInCheck(state),
    key: positionKey(state, legalMoves),
  };
}

/** 生成合法走子的稳定索引键，用作变例树子节点标识 */
export function moveId(move: Move): string {
  return `${squareName(move.from)}${squareName(move.to)}${move.promotion ? "=" + move.promotion.toUpperCase() : ""}`;
}
