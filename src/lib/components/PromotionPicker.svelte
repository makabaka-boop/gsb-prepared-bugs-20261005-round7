<script lang="ts">
  import type { Color, PieceType } from '../chess/types';
  import { squareName } from '../chess/types';

  interface Props {
    color: Color;
    from: number;
    to: number;
    onConfirm: (promotion: Exclude<PieceType, 'p' | 'k'>) => void;
    onCancel: () => void;
  }

  let { color, from, to, onConfirm, onCancel }: Props = $props();

  const CHOICES: Exclude<PieceType, 'p' | 'k'>[] = ['q', 'r', 'b', 'n'];
  const NAMES: Record<string, string> = { q: '后', r: '车', b: '象', n: '马' };
  const GLYPH: Record<Color, Record<string, string>> = {
    w: { q: '♕', r: '♖', b: '♗', n: '♘' },
    b: { q: '♛', r: '♜', b: '♝', n: '♞' },
  };
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="选择升变棋子">
  <div class="dialog">
    <h2>选择升变棋子</h2>
    <p class="hint">{squareName(from)} → {squareName(to)}</p>
    <div class="choices">
      {#each CHOICES as choice}
        <button
          type="button"
          class="choice"
          onclick={() => onConfirm(choice)}
          aria-label={NAMES[choice]}
        >
          <span class="glyph" class:white={color === 'w'} class:black={color === 'b'}
            >{GLYPH[color][choice]}</span
          >
          <span class="name">{NAMES[choice]}</span>
        </button>
      {/each}
    </div>
    <button type="button" class="cancel" onclick={onCancel}>取消（走子未提交）</button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 20;
  }

  .dialog {
    background: var(--panel);
    border: 1px solid var(--frame);
    border-radius: 10px;
    padding: 20px 24px;
    text-align: center;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }

  h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }

  .hint {
    margin: 0 0 14px;
    color: var(--muted);
    font-size: 13px;
  }

  .choices {
    display: flex;
    gap: 10px;
    justify-content: center;
  }

  .choice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 64px;
    padding: 8px 4px;
    border: 1px solid var(--frame);
    border-radius: 8px;
    background: var(--light-sq);
    cursor: pointer;
    transition: transform 0.08s ease, box-shadow 0.08s ease;
  }

  .choice:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
    border-color: var(--select);
  }

  .glyph {
    font-size: 38px;
    line-height: 1;
  }

  .white {
    color: #f5f5f5;
    text-shadow: 0 0 2px #333;
  }

  .black {
    color: #1c1c1c;
  }

  .name {
    font-size: 12px;
    color: var(--text);
  }

  .cancel {
    margin-top: 16px;
    padding: 6px 14px;
    border: 1px solid var(--frame);
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
  }

  .cancel:hover {
    color: var(--text);
    border-color: var(--marker);
  }
</style>
