// 国际象棋核心类型定义
// 棋盘表示：64 格一维数组，sq = rank * 8 + file
// rank 0 = 第 1 横线（白方底线），rank 7 = 第 8 横线（黑方底线）
// file 0 = a 线，file 7 = h 线

export type Color = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface Piece {
  color: Color;
  type: PieceType;
}

export type Board = (Piece | null)[]; // 长度 64

/** 王车易位权，K=短易位(王翼)，Q=长易位(后翼)，小写为黑方 */
export interface CastlingRights {
  K: boolean; // 白方王翼 e1-g1
  Q: boolean; // 白方后翼 e1-c1
  k: boolean; // 黑方王翼 e8-g8
  q: boolean; // 黑方后翼 e8-c8
}

export interface Move {
  from: number;
  to: number;
  piece: PieceType;
  color: Color;
  capture?: PieceType;
  promotion?: Exclude<PieceType, "p" | "k">;
  castle?: "K" | "Q" | "k" | "q";
  enPassant?: boolean;
}

export interface PositionState {
  board: Board;
  turn: Color;
  castling: CastlingRights;
  /** 吃过路兵目标格（被双进兵越过的格），无则 null */
  epSquare: number | null;
}

export interface Position extends PositionState {
  legalMoves: Move[];
  inCheck: boolean;
  /** 局面身份键：棋子布局 + 行棋方 + 易位权 + 真正可执行的过路兵机会 */
  key: string;
}

export interface CreateMoveSpec {
  from: number;
  to: number;
  promotion?: Exclude<PieceType, "p" | "k">;
}

export function opponent(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function sq(file: number, rank: number): number {
  return rank * 8 + file;
}

export function fileOf(square: number): number {
  return square & 7;
}

export function rankOf(square: number): number {
  return square >> 3;
}

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export function squareName(square: number): string {
  return FILES[fileOf(square)] + (rankOf(square) + 1);
}
