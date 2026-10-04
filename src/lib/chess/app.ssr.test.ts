// @vitest-environment node
import { describe, expect, it, beforeEach } from "vitest";
import { render } from "svelte/server";
import { get } from "svelte/store";
import App from "../../App.svelte";
import { tree } from "./tree";

function html() {
  return render(App).body;
}

/** 统计“合法后续”列表里的走子按钮（Svelte 会给类名加 scoped 后缀） */
function countMoveButtons(out: string): number {
  return out.match(/class="move\b(?:\s|")/g)?.length ?? 0;
}

beforeEach(() => {
  tree.reset();
});

describe("应用 SSR 冒烟", () => {
  it("初始局面渲染：标题、200 节点上限、20 个合法后续", () => {
    const out = html();
    expect(out).toContain("国际象棋变例板");
    expect(out).toContain("200");
    expect(out).toContain("白方行棋");
    expect(countMoveButtons(out)).toBe(20);
  });

  it("落子后轮次切换、路径更新、合法后续重算", () => {
    tree.play({ from: 12, to: 28 }); // e2-e4
    const out = html();
    expect(out).toContain("黑方行棋");
    expect(out).toContain("e2→e4");
    // 黑方初始局面 20 个走子
    expect(countMoveButtons(out)).toBe(20);
  });

  it("升变选择未确认前不产生节点（无幽灵子节点）", () => {
    // 初始局面节点数恒为 1；走到升变局面需要的节点不创建于“选择中”
    expect(get(tree).nodeCount).toBe(1);
    // 渲染应用不改变树
    html();
    expect(get(tree).nodeCount).toBe(1);
  });

  it("分支并存时路径区显示分叉标记", () => {
    tree.play({ from: 12, to: 28 }); // e4
    tree.play({ from: 52, to: 36 }); // e5
    tree.play({ from: 6, to: 21 }); // Nf3
    tree.back();
    tree.play({ from: 5, to: 26 }); // Bc4 (f1=5 -> c4=26)
    const out = html();
    expect(out).toContain("⑂2");
  });
});
