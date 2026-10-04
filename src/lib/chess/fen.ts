import type { Board, CastlingRights, Piece, PositionState } from "./types";
import { fileOf, rankOf, sq } from "./types";

const PIECE_CHARS: Record<string, Piece> = {};
for (const c of ["p", "n", "b", "r", "q", "k"]) {
  PIECE_CHARS[c] = { color: "b", type: c as Piece["type"] };
  PIECE_CHARS[c.toUpperCase()] = { color: "w", type: c as Piece["type"] };
}

/**
 * 从 FEN 解析局面（只取前四域：布局 / 行棋方 / 易位权 / 过路兵格）。
 * 主要供测试加载对照局面使用。
 */
export function parseFen(fen: string): PositionState {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`FEN 不完整: ${fen}`);

  const board: Board = new Array(64).fill(null);
  const rows = parts[0].split("/");
  if (rows.length !== 8) throw new Error(`FEN 布局必须有 8 行: ${fen}`);
  for (let r = 0; r < 8; r++) {
    const row = rows[7 - r];
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += Number(ch);
      } else {
        const piece = PIECE_CHARS[ch];
        if (!piece) throw new Error(`FEN 含未知棋子字符: ${ch}`);
        if (f > 7) throw new Error(`FEN 行溢出: ${row}`);
        board[sq(f, r)] = { ...piece };
        f++;
      }
    }
    if (f !== 8) throw new Error(`FEN 行宽度不足 8: ${row}`);
  }

  if (parts[1] !== "w" && parts[1] !== "b") throw new Error("FEN 行棋方非法");
  const turn = parts[1];

  const castling: CastlingRights = { K: false, Q: false, k: false, q: false };
  if (parts[2] !== "-") {
    for (const ch of parts[2]) {
      if (ch === "K" || ch === "Q" || ch === "k" || ch === "q")
        castling[ch] = true;
    }
  }

  let epSquare: number | null = null;
  if (parts[3] !== "-") {
    const f = parts[3].charCodeAt(0) - 97;
    const r = Number(parts[3][1]) - 1;
    if (f < 0 || f > 7 || r < 0 || r > 7) throw new Error("FEN 过路兵格非法");
    epSquare = sq(f, r);
  }

  return { board, turn, castling, epSquare };
}

/** 序列化为 FEN 前四域（过路兵格按原始状态写出，未做 FIDE 合法化裁剪） */
export function toFen(state: PositionState): string {
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
        rows += p.color === "w" ? p.type.toUpperCase() : p.type;
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

  const ep =
    state.epSquare === null
      ? "-"
      : String.fromCharCode(97 + fileOf(state.epSquare)) +
        (rankOf(state.epSquare) + 1);

  return `${rows} ${state.turn} ${cr} ${ep}`;
}
