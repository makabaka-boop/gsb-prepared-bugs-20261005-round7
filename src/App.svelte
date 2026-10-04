<script lang="ts">
 import TransplantPanel from "./lib/components/TransplantPanel.svelte";
  import { fromStore } from 'svelte/store';
  import Board from './lib/components/Board.svelte';
  import PromotionPicker from './lib/components/PromotionPicker.svelte';
  import StatusPanel from './lib/components/StatusPanel.svelte';
  import VariationsPanel from './lib/components/VariationsPanel.svelte';
  import {
    isPromotionAt,
    movesFrom,
    statusOf,
    tree,
    MAX_NODES,
  } from './lib/chess/tree';
  import type { VNode } from './lib/chess/tree';
  import { findKing } from './lib/chess/position';
  import type { PieceType } from './lib/chess/types';

  type Promotion = Exclude<PieceType, 'p' | 'k'>;

  const data = fromStore(tree);

  let selected = $state<number | null>(null);
  let flipped = $state(false);
  let pendingPromotion = $state<{ from: number; to: number } | null>(null);

  const current = $derived(data.current.nodes[data.current.currentId] as VNode);
  const position = $derived(current.position);
  const status = $derived(statusOf(current));

  const path = $derived(tree.pathOf(data.current, data.current.currentId));

  const targets = $derived.by(() => {
    const map = new Map<number, 'move' | 'capture'>();
    if (selected === null) return map;
    for (const move of movesFrom(data.current, selected)) {
      map.set(move.to, move.capture || move.enPassant ? 'capture' : 'move');
    }
    return map;
  });

  const lastMove = $derived(
    current.move ? { from: current.move.from, to: current.move.to } : null,
  );

  const checkSquare = $derived(
    status.check ? findKing(position.board, position.turn) : null,
  );

  const atLimit = $derived(data.current.nodeCount >= MAX_NODES);

  // 切换局面（沿树跳转）时清除选择
  $effect(() => {
    void data.current.currentId;
    selected = null;
    pendingPromotion = null;
  });

  function selectSquare(square: number) {
    if (pendingPromotion) return;
    const node = data.current.nodes[data.current.currentId];
    const piece = node.position.board[square];

    if (selected === square) {
      selected = null;
      return;
    }

    if (selected !== null && targets.has(square)) {
      if (isPromotionAt(data.current, selected, square)) {
        pendingPromotion = { from: selected, to: square };
        return;
      }
      tree.play({ from: selected, to: square });
      return;
    }

    if (piece && piece.color === node.position.turn && movesFrom(data.current, square).length > 0) {
      selected = square;
    } else {
      selected = null;
    }
  }

  function confirmPromotion(promotion: Promotion) {
    if (!pendingPromotion) return;
    tree.play({ ...pendingPromotion, promotion });
    pendingPromotion = null;
  }

  function cancelPromotion() {
    pendingPromotion = null;
  }

  function playMoveFromList(node: VNode, encoded: string) {
    const [fromStr, toStr, promotion] = encoded.split('-');
    tree.play({
      from: Number(fromStr),
      to: Number(toStr),
      promotion: (promotion || undefined) as Promotion | undefined,
    });
  }

  function reset() {
    if (data.current.nodeCount > 1) {
      const ok = window.confirm('清空全部变例并回到初始局面？');
      if (!ok) return;
    }
    tree.reset();
  }
</script>

<main>
  <header>
    <h1>国际象棋变例板</h1>
    <p class="subtitle">离线运行 · 自建合法走子引擎 · 最多 {MAX_NODES} 个变例节点</p>
  </header>

  <div class="layout">
    <div class="board-column">
      <Board
        board={position.board}
        selected={selected}
        targets={targets}
        lastMove={lastMove}
        checkSquare={checkSquare}
        flipped={flipped}
        onSelect={selectSquare}
      />
      {#if atLimit && !status.checkmate && !status.stalemate}
        <p class="limit-hint">已达 {MAX_NODES} 节点上限：可进入已有变例，但不能再新建分支。</p>
      {/if}
    </div>

    <div class="side-column">
      <StatusPanel
        turn={position.turn}
        status={status}
        nodeCount={data.current.nodeCount}
        flipped={flipped}
        onReset={reset}
        onFlip={() => (flipped = !flipped)}
      />
      <VariationsPanel
        data={data.current}
        path={path}
        onGoto={(id) => tree.goto(id)}
        onPlayMove={playMoveFromList}
        onBack={() => tree.back()}
        onForward={() => tree.forward()}
        onStart={() => tree.toStart()}
        onDeleteBranch={() => tree.deleteBranch()}
      />
    </div>
  </div>

  {#if pendingPromotion}
    <PromotionPicker
      color={position.turn}
      from={pendingPromotion.from}
      to={pendingPromotion.to}
      onConfirm={confirmPromotion}
      onCancel={cancelPromotion}
    />
  {/if}
</main>

<style>
  :global(:root) {
    --bg: #1a1d24;
    --panel: #232730;
    --frame: #3a4150;
    --text: #e8eaed;
    --muted: #9aa3b2;
    --light-sq: #ebecd0;
    --dark-sq: #739552;
    --select: #74c0fc;
    --marker: rgba(20, 33, 61, 0.35);
    --last-move: rgba(255, 213, 79, 0.45);
  }

  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
  }

  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 18px 20px 40px;
  }

  header {
    margin-bottom: 14px;
  }

  h1 {
    margin: 0;
    font-size: 22px;
  }

  .subtitle {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 380px);
    gap: 20px;
    align-items: start;
  }

  .board-column {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .side-column {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .limit-hint {
    margin: 10px 0 0;
    color: #ffd43b;
    font-size: 13px;
  }

  @media (max-width: 860px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>

<TransplantPanel />
