<script lang="ts">
  import type { Color } from '../chess/types';
  import type { PositionStatus } from '../chess/tree';
  import { MAX_NODES } from '../chess/tree';

  interface Props {
    turn: Color;
    status: PositionStatus;
    nodeCount: number;
    flipped: boolean;
    onReset: () => void;
    onFlip: () => void;
  }

  let { turn, status, nodeCount, flipped, onReset, onFlip }: Props = $props();
</script>

<section class="panel">
  <div class="turn-row">
    <span class="turn-glyph" class:white={turn === 'w'} class:black={turn === 'b'}>
      {turn === 'w' ? '♔' : '♚'}
    </span>
    <span class="turn-text">{turn === 'w' ? '白方行棋' : '黑方行棋'}</span>
  </div>

  <ul class="status-list">
    {#if status.checkmate}
      <li class="bad">将死 —— {turn === 'w' ? '黑方' : '白方'}获胜</li>
    {:else if status.stalemate}
      <li class="note">逼和（无子可动且未被将军）</li>
    {:else if status.check}
      <li class="bad">将军！</li>
    {/if}
    {#if status.threefoldClaim}
      <li class="claim">三次重复（第 {status.repCount} 次）—— 可申领和棋</li>
    {:else if status.repCount === 2}
      <li class="note">同一局面第 2 次出现</li>
    {/if}
    {#if !status.checkmate && !status.stalemate}
      <li class="muted">
        {status.check ? '' : '局面正常 · '}重复计数 {status.repCount}
      </li>
    {/if}
  </ul>

  <div class="meta">
    <span>变例节点 {nodeCount} / {MAX_NODES}</span>
    <div class="buttons">
      <button type="button" onclick={onFlip}>{flipped ? '白方在下' : '翻转棋盘'}</button>
      <button type="button" class="danger" onclick={onReset}>回到初始局面</button>
    </div>
  </div>
</section>

<style>
  .panel {
    border: 1px solid var(--frame);
    border-radius: 8px;
    padding: 12px 14px;
    background: var(--panel);
  }

  .turn-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .turn-glyph {
    font-size: 26px;
    line-height: 1;
  }

  .white {
    color: #f5f5f5;
    text-shadow: 0 0 2px #333;
  }

  .black {
    color: #1c1c1c;
  }

  .turn-text {
    font-weight: 600;
  }

  .status-list {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
  }

  .bad {
    color: #ff8787;
    font-weight: 700;
  }

  .claim {
    color: #ffd43b;
    font-weight: 700;
  }

  .note {
    color: var(--muted);
  }

  .muted {
    color: var(--muted);
    font-size: 12px;
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    color: var(--muted);
    border-top: 1px solid var(--frame);
    padding-top: 8px;
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  button {
    flex: 1;
    padding: 5px 8px;
    border: 1px solid var(--frame);
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
  }

  button:hover {
    border-color: var(--select);
  }

  button.danger:hover {
    border-color: #ff6b6b;
    color: #ff8787;
  }
</style>
