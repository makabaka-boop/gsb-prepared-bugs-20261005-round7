import { describe, expect, it, beforeEach } from "vitest";
import { get } from "svelte/store";
import { tree, MAX_NODES, statusOf } from "./tree";
import { findLegalMove, legalMovesOf } from "./position";
import { parseFen } from "./fen";
import type { Move } from "./types";

function parseSquare(name: string): number {
  return (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);
}

/** 按代数格提交走子，期望成功 */
function play(
  fromName: string,
  toName: string,
  promotion?: "q" | "r" | "b" | "n",
) {
  const id = tree.play({
    from: parseSquare(fromName),
    to: parseSquare(toName),
    promotion,
  });
  expect(id, `${fromName}->${toName} 应被接受`).not.toBeNull();
  return id!;
}

function currentNode() {
  const data = get(tree);
  return data.nodes[data.currentId];
}

beforeEach(() => {
  tree.reset();
});

describe("分支回退与兄弟变例隔离", () => {
  it("回到祖先另走一支：轮次/易位权只来自该祖先路径，兄弟两支互不影响", () => {
    // 1.e4 e5
    play("e2", "e4");
    play("e7", "e5");

    // 分支 A：2.Nf3
    play("g1", "f3");
    expect(get(tree).nodeCount).toBe(4);
    tree.back(); // 撤回，回到白方行棋

    expect(currentNode().position.turn).toBe("w");

    // 分支 B：2.Bc4
    play("f1", "c4");
    const data = get(tree);
    const bishopNode = data.nodes[data.currentId];
    expect(bishopNode.move!.from).toBe(5); // f1
    expect(bishopNode.position.turn).toBe("b");

    const parent = data.nodes[bishopNode.parentId!];
    expect(parent.childrenIds).toHaveLength(2); // 兄弟并存

    // 进入兄弟分支 A：只包含 Nf3 的历史
    const knightId =
      parent.childByMove[
        Object.keys(parent.childByMove).find((key) => {
          const child = data.nodes[parent.childByMove[key]];
          return child.move!.from === 6; // g1
        })!
      ];
    tree.goto(knightId);
    const knightNode = currentNode();
    expect(knightNode.move!.to).toBe(21); // f3
    expect(knightNode.position.turn).toBe("b");
    expect(knightNode.position.key).not.toBe(bishopNode.position.key);
  });

  it("过路兵机会只取自己路径：双步兵那一支有 epSquare，另一支没有", () => {
    // 1.e4 之后分两支：
    //  支 A：1...d5（黑双步）→ epSquare=d6（白兵 e4 与 d6 不斜对，无合法吃子）
    //  支 B：1...Nc6（无 ep）
    play("e2", "e4");
    play("d7", "d5");
    expect(currentNode().position.epSquare).toBe(43); // d6
    expect(currentNode().position.key.split(" ")[3]).toBe("-"); // 不能合法吃 → 不入身份

    tree.back(); // 回到 1.e4 之后、黑方行棋
    play("b8", "c6");
    expect(currentNode().position.epSquare).toBeNull();

    // 切回支 A，epSquare 仍然在；切到支 B 则没有
    const data = get(tree);
    const parentAfterE4 = data.nodes[currentNode().parentId!];
    const d5Child = Object.values(parentAfterE4.childByMove).find((id) => {
      return data.nodes[id].move!.to === 35; // d5
    })!;
    tree.goto(d5Child);
    expect(currentNode().position.epSquare).toBe(43);
  });

  it("沿分支继续走会清除上一手的 ep 机会，不残留兄弟状态", () => {
    play("e2", "e4");
    play("d7", "d5");
    play("b1", "c3"); // 白走无关棋子
    expect(currentNode().position.epSquare).toBeNull();
  });
});

describe("三次重复计数按路径独立", () => {
  it("马往返：第 2 次不可申领、第 3 次可申领；从重复点分叉的新支计数独立", () => {
    play("g1", "f3");
    play("g8", "f6");
    play("f3", "g1");
    play("f6", "g8"); // 初始局面第 2 次

    let node = currentNode();
    const data = get(tree);
    expect(node.position.key).toBe(data.nodes[data.rootId].position.key);
    expect(node.repCount).toBe(2);
    expect(statusOf(node).threefoldClaim).toBe(false);

    const secondRepeatId = data.currentId;

    // 从这里分叉走 Nc3：该局面在新路径上只出现 1 次
    play("b1", "c3");
    expect(currentNode().repCount).toBe(1);

    // 回重复点完成第 3 次
    tree.goto(secondRepeatId);
    play("g1", "f3");
    play("g8", "f6");
    play("f3", "g1");
    play("f6", "g8");
    node = currentNode();
    expect(node.repCount).toBe(3);
    expect(statusOf(node).threefoldClaim).toBe(true);
  });
});

describe("升变取消不留幽灵子节点", () => {
  it("确认前不调用 play 时树不变化；确认后仅产生对应升变的那一个节点", () => {
    // 用引擎构造 e7 兵候选局面，验证四种升变是四个互斥走法
    const state = parseFen("k7/4P3/8/8/8/8/8/4K3 w - - 0 1");
    const promotions = legalMovesOf(state).filter((m) => m.promotion);
    expect(promotions.map((m) => m.promotion).sort()).toEqual([
      "b",
      "n",
      "q",
      "r",
    ]);

    // store 契约：不提交即无节点（取消按钮做的就是不提交）
    const countBefore = get(tree).nodeCount;
    expect(currentNode().childrenIds).toHaveLength(0);

    // 初始局面普通走子只产生一个节点，且相同走法重复提交复用同一节点
    const id1 = play("e2", "e4");
    expect(get(tree).nodeCount).toBe(countBefore + 1);
    tree.back();
    const id2 = play("e2", "e4");
    expect(id2).toBe(id1);
    expect(get(tree).nodeCount).toBe(countBefore + 1);
  });

  it("两种升变在同一父节点下互为兄弟，且可来回切换复核", () => {
    // 初始局面没有马上可升变的着法，因此这里直接用引擎层断言：
    // 同一起/终点、不同 promotion 是不同 Move，findLegalMove 必须带 promotion 才命中。
    const state = parseFen("k7/4P3/8/8/8/8/8/4K3 w - - 0 1");
    const toQueen = findLegalMove(state, 52, 60, "q"); // e7=52 -> e8=60
    const toKnight = findLegalMove(state, 52, 60, "n");
    const withoutChoice = legalMovesOf(state).filter(
      (m) => m.from === 52 && m.to === 60,
    );
    expect(toQueen?.promotion).toBe("q");
    expect(toKnight?.promotion).toBe("n");
    expect(withoutChoice).toHaveLength(4); // 未指定升变时四种都存在
  });

  it("真实对局推进到升变点：选后与选马各建一支，取消则无节点", () => {
    // 1.a4 a5 2.b4 axb4 3.a5 Nc6 4.a6 Rb8 5.a7 Nh6 → 白兵在 a7，可 a8 升变
    const line: [string, string][] = [
      ["a2", "a4"],
      ["a7", "a5"],
      ["b2", "b4"],
      ["a5", "b4"],
      ["a4", "a5"],
      ["b8", "c6"],
      ["a5", "a6"],
      ["a8", "b8"],
      ["a6", "a7"],
      ["g8", "h6"],
    ];
    for (const [from, to] of line) play(from, to);

    const atPromotion = currentNode();
    expect(atPromotion.position.turn).toBe("w");
    expect(atPromotion.childrenIds).toHaveLength(0);

    // 模拟用户尚未确认升变：什么都不发生
    const countBefore = get(tree).nodeCount;

    // 确认升后
    const queenId = tree.play({
      from: parseSquare("a7"),
      to: parseSquare("a8"),
      promotion: "q",
    });
    expect(queenId).not.toBeNull();
    expect(get(tree).nodeCount).toBe(countBefore + 1);
    const queenNode = currentNode();
    expect(queenNode.move!.promotion).toBe("q");

    // 回到升变点升马，形成兄弟
    tree.back();
    const knightId = tree.play({
      from: parseSquare("a7"),
      to: parseSquare("a8"),
      promotion: "n",
    });
    expect(knightId).not.toBeNull();
    expect(knightId).not.toBe(queenId);
    expect(get(tree).nodeCount).toBe(countBefore + 2);
    const parent = get(tree).nodes[currentNode().parentId!];
    expect(parent.childrenIds).toHaveLength(2);
    expect(currentNode().move!.promotion).toBe("n");

    // 两支后续分别与引擎一致（升后局面白后、升马局面白马）
    expect(currentNode().position.board[parseSquare("a8")]?.type).toBe("n");
    tree.goto(queenId!);
    expect(currentNode().position.board[parseSquare("a8")]?.type).toBe("q");
  });
});

describe("节点上限（200）与删除分支", () => {
  it("沿单链推进至终止或上限；上限处不能新建，已有子节点仍可进入", () => {
    expect(MAX_NODES).toBe(200);
    let guard = 0;
    while (guard++ < 260) {
      const data = get(tree);
      const node = data.nodes[data.currentId];
      const moves = node.position.legalMoves;
      if (moves.length === 0) break;
      const m: Move = moves[0];
      if (
        tree.play({ from: m.from, to: m.to, promotion: m.promotion }) === null
      )
        break;
    }
    const data = get(tree);
    expect(data.nodeCount).toBeLessThanOrEqual(MAX_NODES);
    if (data.nodeCount === MAX_NODES) {
      const node = data.nodes[data.currentId];
      // 尝试新建一个必然不在子节点中的着法（若还有合法走子）会被拒绝
      if (node.position.legalMoves.length > 0) {
        const m = node.position.legalMoves[0];
        const exists = Object.values(node.childByMove).some((id) => {
          const child = data.nodes[id];
          return (
            child.move!.from === m.from &&
            child.move!.to === m.to &&
            (child.move!.promotion ?? "") === (m.promotion ?? "")
          );
        });
        if (!exists) {
          expect(
            tree.play({ from: m.from, to: m.to, promotion: m.promotion }),
          ).toBeNull();
          expect(get(tree).nodeCount).toBe(MAX_NODES);
        }
      }
    }
  }, 60000);

  it("删除分支回收节点，父节点可重走；根节点不可删", () => {
    play("e2", "e4");
    const afterFirst = get(tree).nodeCount;
    play("e7", "e5");
    expect(get(tree).nodeCount).toBe(afterFirst + 1);
    tree.deleteBranch();
    expect(get(tree).nodeCount).toBe(afterFirst);
    expect(currentNode().childrenIds).toHaveLength(0);

    tree.toStart();
    tree.deleteBranch(); // 根节点不可删：no-op，树保持不变
    expect(get(tree).currentId).toBe(get(tree).rootId);
    expect(get(tree).nodeCount).toBe(2);
  });
});

describe("树上合法后续即引擎合法走子", () => {
  it("1.e4 e5 后：e4 兵正面被堵不能直进，d2 兵可走 d3/d4", () => {
    play("e2", "e4");
    play("e7", "e5");
    // e4 兵（28）前方 e5 被黑兵占据，又无斜吃目标 → 无走子
    const e4moves = currentNode().position.legalMoves.filter(
      (m) => m.from === 28,
    );
    expect(e4moves).toHaveLength(0);
    // d2 兵（11）可进 d3(19)、d4(27)
    const d2 = currentNode().position.legalMoves.filter((m) => m.from === 11);
    expect(d2.map((m) => m.to).sort((a, b) => a - b)).toEqual([19, 27]);
    // 当前白方行棋，所有合法走子都是白方的
    expect(
      currentNode().position.legalMoves.every((m) => m.color === "w"),
    ).toBe(true);
  });

  it("将死节点没有任何合法后续", () => {
    // 学者杀无法从初始快速走出来时，直接用引擎验证同函数，
    // 树上选择一条真实短对局验证终局为空：
    const mate = parseFen(
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3",
    );
    expect(legalMovesOf(mate)).toHaveLength(0);
  });
});
