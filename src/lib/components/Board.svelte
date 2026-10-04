<script lang="ts">
  import type { Board as BoardType, Color, PieceType } from '../chess/types';
  import { fileOf, rankOf, sq } from '../chess/types';

  interface Props {
    board: BoardType;
    selected: number | null;
    targets: Map<number, 'move' | 'capture'>;
    lastMove: { from: number; to: number } | null;
    checkSquare: number | null;
    flipped?: boolean;
    onSelect: (square: number) => void;
  }

  let {
    board,
    selected,
    targets,
    lastMove,
    checkSquare,
    flipped = false,
    onSelect,
  }: Props = $props();

  const GLYPH: Record<Color, Record<PieceType, string>> = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
  };

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  interface Cell {
    square: number;
    file: number;
    rank: number;
    dark: boolean;
    fileLabel: string;
    rankLabel: string;
  }

  const cells = $derived.by<Cell[]>(() => {
    const out: Cell[] = [];
    for (let dr = 0; dr < 8; dr++) {
      for (let df = 0; df < 8; df++) {
        const rank = flipped ? dr : 7 - dr;
        const file = flipped ? 7 - df : df;
        out.push({
          square: sq(file, rank),
          file,
          rank,
          dark: (file + rank) % 2 === 1,
          fileLabel: FILES[file],
          rankLabel: String(rank + 1),
        });
      }
    }
    return out;
  });

  const columnLabels = $derived(
    flipped ? [...FILES].reverse() : FILES,
  );
  const rowLabels = $derived(
    flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1],
  );
</script>

<div class="board-wrap">
  <div class="rank-labels">
    {#each rowLabels as label}
      <span class="rank-label">{label}</span>
    {/each}
  </div>
  <div class="board">
    {#each cells as cell (cell.square)}
      {@const piece = board[cell.square]}
      {@const kind = targets.get(cell.square)}
      <button
        type="button"
        class="square"
        class:dark={cell.dark}
        class:light={!cell.dark}
        class:selected={selected === cell.square}
        class:lastfrom={lastMove !== null && lastMove.from === cell.square}
        class:lastto={lastMove !== null && lastMove.to === cell.square}
        class:check={checkSquare === cell.square}
        onclick={() => onSelect(cell.square)}
        aria-label={`${cell.fileLabel}${cell.rankLabel}`}
      >
        {#if cell.file === (flipped ? 7 : 0)}
          <span class="corner-rank" class:ondark={cell.dark}>{cell.rankLabel}</span>
        {/if}
        {#if cell.rank === (flipped ? 7 : 0)}
          <span class="corner-file" class:ondark={cell.dark}>{cell.fileLabel}</span>
        {/if}
        {#if piece}
          <span class="piece" class:white={piece.color === 'w'} class:black={piece.color === 'b'}
            >{GLYPH[piece.color][piece.type]}</span
          >
        {/if}
        {#if kind === 'move'}
          <span class="dot"></span>
        {:else if kind === 'capture'}
          <span class="ring"></span>
        {/if}
      </button>
    {/each}
  </div>
  <div class="file-labels">
    <span></span>
    {#each columnLabels as label}
      <span class="file-label">{label}</span>
    {/each}
  </div>
</div>

<style>
  .board-wrap {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr auto;
    gap: 2px 6px;
    width: min(92vw, 560px);
  }

  .rank-labels {
    grid-column: 1;
    grid-row: 1;
    display: grid;
    grid-template-rows: repeat(8, 1fr);
    align-items: stretch;
  }

  .rank-label {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: var(--muted);
  }

  .file-labels {
    grid-column: 2;
    grid-row: 2;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
  }

  .file-label {
    text-align: center;
    font-size: 12px;
    color: var(--muted);
  }

  .board {
    grid-column: 2;
    grid-row: 1;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(8, 1fr);
    aspect-ratio: 1 / 1;
    border: 2px solid var(--frame);
    border-radius: 4px;
    overflow: hidden;
    user-select: none;
  }

  .square {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .light {
    background: var(--light-sq);
  }

  .dark {
    background: var(--dark-sq);
  }

  .piece {
    font-size: clamp(26px, 6.4vw, 46px);
    line-height: 1;
    pointer-events: none;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
  }

  .white {
    color: #fdfdfd;
  }

  .black {
    color: #1c1c1c;
  }

  .selected {
    box-shadow: inset 0 0 0 4px var(--select);
  }

  .lastfrom,
  .lastto {
    background: var(--last-move);
  }

  .check {
    background: radial-gradient(circle, #ff6b6b 10%, #c92a2a 75%);
  }

  .dot {
    position: absolute;
    width: 28%;
    height: 28%;
    border-radius: 50%;
    background: var(--marker);
    pointer-events: none;
  }

  .ring {
    position: absolute;
    inset: 6%;
    border-radius: 50%;
    border: 4px solid var(--marker);
    pointer-events: none;
  }

  .corner-rank,
  .corner-file {
    position: absolute;
    font-size: clamp(8px, 1.6vw, 11px);
    font-weight: 600;
    pointer-events: none;
  }

  .corner-rank {
    top: 1px;
    left: 2px;
  }

  .corner-file {
    bottom: 1px;
    right: 3px;
  }

  .ondark {
    color: rgba(255, 255, 255, 0.75);
  }

  :global(.light) .corner-file,
  :global(.light) .corner-rank {
    color: rgba(0, 0, 0, 0.55);
  }
</style>
