import { transplant } from "./transplant";
import { writable } from "svelte/store";
import {
  applyMove,
  evaluatePosition,
  findLegalMove,
  initialState,
  moveId,
} from "./position";
import type {
  CastlingRights,
  Color,
  CreateMoveSpec,
  Move,
  PieceType,
  Position,
} from "./types";
import { fileOf, opponent, rankOf, squareName, sq } from "./types";

/** 变例节点上限（含根节点） */
export const MAX_NODES = 200;

export interface VNode {
  id: number;
  parentId: number | null;
  move: Move | null; // 根节点为 null
  childrenIds: number[];
  /** 子节点按走子索引：moveId -> childId */
  childByMove: Record<string, number>;
  position: Position;
  /** 本节点位置在其祖先路径上（含自身）第几次出现，1 起 */
  repCount: number;
}

export interface TreeData {
  nodes: Record<number, VNode>;
  rootId: number;
  currentId: number;
  nextNodeId: number;
  nodeCount: number;
}

export interface LegalLineItem {
  move: Move;
  id: string;
  label: string;
  childId: number | null; // 该走子是否已在本节点的子变例中
  promotion?: boolean;
}

function createTree(): TreeData {
  const root: VNode = {
    id: 0,
    parentId: null,
    move: null,
    childrenIds: [],
    childByMove: {},
    position: evaluatePosition(initialState()),
    repCount: 1,
  };
  return {
    nodes: { 0: root },
    rootId: 0,
    currentId: 0,
    nextNodeId: 1,
    nodeCount: 1,
  };
}

const GLYPH: Record<Color, Record<PieceType, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

/** 可读的走子标签（非 PGN，仅用于界面复核） */
export function moveLabel(move: Move): string {
  if (move.castle === "K" || move.castle === "k") return "O-O";
  if (move.castle === "Q" || move.castle === "q") return "O-O-O";
  const glyph = GLYPH[move.color][move.piece];
  const promo = move.promotion ? `=${GLYPH[move.color][move.promotion]}` : "";
  const ep = move.enPassant ? " e.p." : "";
  return `${glyph}${squareName(move.from)}${move.capture ? "×" : "→"}${squareName(move.to)}${promo}${ep}`;
}

function createVariationStore() {
  const { subscribe, set, update } = writable<TreeData>(createTree());

  function pathOf(data: TreeData, nodeId: number): VNode[] {
    const path: VNode[] = [];
    let cur: VNode | undefined = data.nodes[nodeId];
    while (cur) {
      path.push(cur);
      cur = cur.parentId === null ? undefined : data.nodes[cur.parentId];
    }
    path.reverse();
    return path;
  }

  /** 当前节点全部合法后续（含是否已建过分支的标记） */
  function legalLine(data: TreeData): LegalLineItem[] {
    const node = data.nodes[data.currentId];
    return node.position.legalMoves.map((move) => ({
      move,
      id: moveId(move),
      label: moveLabel(move),
      childId: node.childByMove[moveId(move)] ?? null,
    }));
  }

  /** 当前祖先路径上与给定身份键相同的局面次数 */
  function countRepetition(
    data: TreeData,
    nodeId: number,
    key: string,
  ): number {
    let count = 0;
    for (const ancestor of pathOf(data, nodeId)) {
      if (ancestor.position.key === key) count++;
    }
    return count;
  }

  return {
    subscribe,

    /** 重置到初始局面 */
    reset() {
      set(createTree());
    },

    /** 跳转到任意节点（祖先或兄弟变例）；所有派生状态只取自该节点路径 */
    goto(nodeId: number) {
      update((data) => {
        if (!data.nodes[nodeId]) return data;
        return { ...data, currentId: nodeId };
      });
    },

    back(steps = 1) {
      update((data) => {
        let id = data.currentId;
        for (let i = 0; i < steps; i++) {
          const node = data.nodes[id];
          if (node.parentId === null) break;
          id = node.parentId;
        }
        return { ...data, currentId: id };
      });
    },

    toStart() {
      update((data) => ({ ...data, currentId: data.rootId }));
    },

    forward() {
      update((data) => {
        const node = data.nodes[data.currentId];
        if (node.childrenIds.length === 0) return data;
        return { ...data, currentId: node.childrenIds[0] };
      });
    },

    /**
     * 在当前节点落子。要求 spec 已带升变选择（若目标着法是升变）。
     * 相同走子复用既有子节点（回到旧变例），否则新建一支。
     * 升变选择确认前 UI 不会调用本方法，因此取消升变不会留下任何节点。
     */
    play(spec: CreateMoveSpec): number | null {
      let result: number | null = null;
      update((data) => {
        const node = data.nodes[data.currentId];
        const move = findLegalMove(
          node.position,
          spec.from,
          spec.to,
          spec.promotion,
        );
        if (!move) return data;

        const existing = node.childByMove[moveId(move)];
        if (existing !== undefined) {
          data = { ...data, currentId: existing };
          result = existing;
          return data;
        }

        if (data.nodeCount >= MAX_NODES) return data;

        const position = evaluatePosition(applyMove(node.position, move));
        const id = data.nextNodeId;
        const vnode: VNode = {
          id,
          parentId: node.id,
          move,
          childrenIds: [],
          childByMove: {},
          position,
          repCount: 0,
        };
        vnode.repCount = countRepetition(data, node.id, position.key) + 1;

        const parent: VNode = {
          ...node,
          childrenIds: [...node.childrenIds, id],
          childByMove: { ...node.childByMove, [moveId(move)]: id },
        };

        data = {
          ...data,
          nodes: { ...data.nodes, [node.id]: parent, [id]: vnode },
          currentId: id,
          nextNodeId: id + 1,
          nodeCount: data.nodeCount + 1,
        };
        result = id;
        return data;
      });
      return result;
    },

    /** 删除当前节点所在分支（根节点不可删） */
    deleteBranch() {
      update((data) => {
        const node = data.nodes[data.currentId];
        if (node.parentId === null) return data;

        // 收集整棵子树
        const toDelete = new Set<number>();
        const stack = [node.id];
        while (stack.length) {
          const id = stack.pop() as number;
          toDelete.add(id);
          stack.push(...data.nodes[id].childrenIds);
        }

        const nodes = { ...data.nodes };
        for (const id of toDelete) delete nodes[id];

        const parent = nodes[node.parentId];
        const parentUpdated: VNode = {
          ...parent,
          childrenIds: parent.childrenIds.filter((id) => id !== node.id),
          childByMove: Object.fromEntries(
            Object.entries(parent.childByMove).filter(
              ([, childId]) => childId !== node.id,
            ),
          ),
        };
        nodes[parent.id] = parentUpdated;

        return {
          ...data,
          nodes,
          currentId: parent.id,
          nodeCount: data.nodeCount - toDelete.size,
        };
      });
    },

    transplant(sourceId: number, targetId: number): string | null {
      let error: string | null = null;
      update((data) => {
        try {
          return transplant(data, sourceId, targetId);
        } catch (e) {
          error = (e as Error).message;
          return data;
        }
      });
      return error;
    },

    // ---- 纯查询辅助（不修改 store） ----
    pathOf,
    legalLine,
  };
}

export const tree = createVariationStore();

/** 当前局面的终局/将军/三次重复可申领状态 */
export interface PositionStatus {
  check: boolean;
  checkmate: boolean;
  stalemate: boolean;
  /** 当前局面是否为第 3 次（或更多次）重复，可据此申领和棋 */
  threefoldClaim: boolean;
  repCount: number;
}

export function statusOf(node: VNode): PositionStatus {
  const pos = node.position;
  const noMoves = pos.legalMoves.length === 0;
  return {
    check: pos.inCheck,
    checkmate: noMoves && pos.inCheck,
    stalemate: noMoves && !pos.inCheck,
    threefoldClaim: node.repCount >= 3,
    repCount: node.repCount,
  };
}

/** 目标格是否需要选择升变棋子 */
export function isPromotionAt(
  data: TreeData,
  from: number,
  to: number,
): boolean {
  const node = data.nodes[data.currentId];
  return node.position.legalMoves.some(
    (m) => m.from === from && m.to === to && !!m.promotion,
  );
}

/** 当前节点由某格出发的合法走子（棋盘落点提示用） */
export function movesFrom(data: TreeData, square: number): Move[] {
  const node = data.nodes[data.currentId];
  return node.position.legalMoves.filter((m) => m.from === square);
}

export { fileOf, rankOf, sq, opponent };
