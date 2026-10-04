<script lang="ts">
  import type { TreeData, VNode } from '../chess/tree';
  import { moveLabel, MAX_NODES } from '../chess/tree';

  interface PathItem {
    node: VNode;
    text: string;
    siblings: number;
    current: boolean;
  }

  interface Props {
    data: TreeData;
    path: VNode[];
    onGoto: (id: number) => void;
    onPlayMove: (node: VNode, moveId: string) => void;
    onBack: () => void;
    onForward: () => void;
    onStart: () => void;
    onDeleteBranch: () => void;
  }

  let { data, path, onGoto, onPlayMove, onBack, onForward, onStart, onDeleteBranch }:
    Props = $props();

  const currentNode = $derived(data.nodes[data.currentId]);

  /** 当前路径带回合编号与兄弟分支标记 */
  const pathItems = $derived.by<PathItem[]>(() => {
    const items: PathItem[] = [];
    let whiteCount = 0;
    let blackCount = 0;
    for (let i = 1; i < path.length; i++) {
      const node = path[i];
      const move = node.move!;
      let text: string;
      if (move.color === 'w') {
        whiteCount++;
        text = `${whiteCount}. ${moveLabel(move)}`;
      } else {
        blackCount++;
        text = `${blackCount}... ${moveLabel(move)}`;
      }
      const parent = path[i - 1];
      items.push({
        node,
        text,
        siblings: parent.childrenIds.length,
        current: node.id === data.currentId,
      });
    }
    return items;
  });

  /** 当前节点的合法后续：升变四种选择合并显示棋子后缀，已存在的子变例做标记 */
  const continuations = $derived.by(() => {
    return currentNode.position.legalMoves.map((move) => {
      const id = `${move.from}-${move.to}-${move.promotion ?? ''}`;
      return {
        move,
        id,
        label: moveLabel(move),
        child: Object.values(currentNode.childByMove).find((childId) => {
          const child = data.nodes[childId];
          return (
            child.move &&
            child.move.from === move.from &&
            child.move.to === move.to &&
            (child.move.promotion ?? '') === (move.promotion ?? '')
          );
        }),
      };
    });
  });

  const childChips = $derived(
    currentNode.childrenIds.map((id) => data.nodes[id]),
  );

  const atLimit = $derived(data.nodeCount >= MAX_NODES);
</script>

<section class="panel">
  <div class="nav-row">
    <button type="button" onclick={onStart} title="回到根">⏮</button>
    <button type="button" onclick={onBack} title="退回上一步">← 退回</button>
    <button
      type="button"
      onclick={onForward}
      title="沿第一条变例前进"
      disabled={childChips.length === 0}
    >
      前进 →
    </button>
    <button
      type="button"
      class="danger"
      onclick={onDeleteBranch}
      title="删除当前分支"
      disabled={currentNode.parentId === null}
    >
      删支
    </button>
  </div>

  <h3>当前走子路径</h3>
  <div class="path">
    <button
      type="button"
      class="path-item root"
      class:current={currentNode.id === data.rootId}
      onclick={() => onGoto(data.rootId)}
    >
      初始局面
    </button>
    {#each pathItems as item (item.node.id)}
      <button
        type="button"
        class="path-item"
        class:current={item.current}
        onclick={() => onGoto(item.node.id)}
      >
        {item.text}
        {#if item.siblings > 1}
          <span class="fork" title="此处存在替代变例">⑂{item.siblings}</span>
        {/if}
      </button>
    {/each}
  </div>

  {#if childChips.length > 0}
    <h3>本局面已建变例</h3>
    <div class="chips">
      {#each childChips as child (child.id)}
        <button type="button" class="chip" onclick={() => onGoto(child.id)}>
          {moveLabel(child.move!)}
        </button>
      {/each}
    </div>
  {/if}

  <h3>
    可复核的合法后续
    <span class="count">（{continuations.length}）</span>
  </h3>
  {#if continuations.length === 0}
    <p class="muted">无合法走子</p>
  {:else}
    <ul class="moves">
      {#each continuations as item (item.id)}
        <li>
          <button
            type="button"
            class="move"
            class:existing={item.child !== undefined}
            disabled={atLimit && item.child === undefined}
            onclick={() => onPlayMove(currentNode, item.id)}
            title={item.child !== undefined ? '点击进入已存在的变例' : '走这一步（新变例）'}
          >
            <span>{item.label}</span>
            {#if item.child !== undefined}
              <span class="badge">已有变例 ↪</span>
            {:else if atLimit}
              <span class="badge">已达节点上限</span>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .panel {
    border: 1px solid var(--frame);
    border-radius: 8px;
    padding: 12px 14px;
    background: var(--panel);
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }

  h3 {
    margin: 8px 0 2px;
    font-size: 13px;
    color: var(--muted);
    text-transform: none;
  }

  .count {
    font-weight: 400;
  }

  .nav-row {
    display: flex;
    gap: 6px;
  }

  .nav-row button {
    padding: 5px 10px;
    border: 1px solid var(--frame);
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
  }

  .nav-row button:hover:not(:disabled) {
    border-color: var(--select);
  }

  .nav-row button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .danger:hover:not(:disabled) {
    border-color: #ff6b6b !important;
    color: #ff8787;
  }

  .path {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 110px;
    overflow-y: auto;
    padding: 4px;
    border: 1px dashed var(--frame);
    border-radius: 6px;
  }

  .path-item {
    border: 1px solid transparent;
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.04);
    color: var(--text);
    padding: 2px 7px;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .path-item:hover {
    border-color: var(--select);
  }

  .path-item.current {
    background: var(--select);
    color: #14213d;
    font-weight: 700;
  }

  .fork {
    margin-left: 4px;
    color: #ffd43b;
    font-size: 11px;
  }

  .path-item.current .fork {
    color: #14213d;
  }

  .root {
    font-style: italic;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chip {
    border: 1px solid #ffd43b55;
    border-radius: 999px;
    background: rgba(255, 212, 59, 0.08);
    color: var(--text);
    padding: 3px 10px;
    font-size: 12px;
    cursor: pointer;
  }

  .chip:hover {
    border-color: #ffd43b;
  }

  .moves {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 4px;
    max-height: 240px;
  }

  .move {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 1px solid var(--frame);
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
  }

  .move:hover:not(:disabled) {
    border-color: var(--select);
    background: rgba(116, 192, 252, 0.12);
  }

  .move.existing {
    border-color: #ffd43b55;
  }

  .move:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .badge {
    font-size: 10px;
    color: #ffd43b;
    white-space: nowrap;
  }

  .muted {
    color: var(--muted);
    font-size: 12px;
    margin: 2px 0;
  }
</style>
