export interface Patch {
  row: number;
  col: number;
  width: number;
  height: number;
  cells: number[];
  mode: "replace" | "xor";
}
export function patchGrid(
  base: Uint8Array,
  rows: number,
  cols: number,
  p: Patch,
): Uint8Array {
  if (
    !p ||
    ![p.row, p.col, p.width, p.height].every(Number.isSafeInteger) ||
    p.width < 1 ||
    p.height < 1 ||
    p.width > cols ||
    p.height > rows ||
    !Array.isArray(p.cells) ||
    p.cells.length !== p.width * p.height ||
    p.cells.some((x) => x !== 0 && x !== 1) ||
    !["replace", "xor"].includes(p.mode)
  )
    throw new Error("Invalid patch");
  const result = base.slice(0, rows * cols);
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const row = (((p.row + y) % rows) + rows) % rows,
        col = (((p.col + x) % cols) + cols) % cols;
      const index = row * cols + col,
        value = p.cells[y * p.width + x];
      result[index] = p.mode === "xor" ? result[index] ^ value : value;
    }
  return result;
}
export interface EditView {
  generation: number;
  rows: number;
  cols: number;
  cells: Uint8Array;
}
export interface PendingEdit {
  before: EditView;
  after: EditView;
  action: "edit" | "undo" | "redo";
}
