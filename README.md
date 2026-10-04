# 国际象棋变例板（离线）

TypeScript + Svelte 5（runes）+ Vite 构建的离线标准国际象棋变例分析板。
从初始局面出发，自建合法走子引擎，支持最多 **200** 个变例节点。
不含 AI、棋钟、PGN/棋谱文本解析。

## 功能

- **合法走子生成（自行实现）**：王安全过滤、王车易位（起/经/落子格攻击检查、被将不可易位）、
  吃过路兵（含移除被吃兵后造成透线将军的非法情形）、兵到底线四种升变。
- **变例树**：任意节点落子新建分支；相同走法复用既有子节点；可回到任意祖先另走一支。
  回到祖先时，行棋方、易位权、过路兵机会、重复计数只来自该祖先路径，
  **不继承兄弟变例的任何历史**。
- **局面身份键（三次重复）**：棋子布局 + 行棋方 + 易位权 + **真正合法的过路兵机会**。
  仅有过路兵目标格、但因王暴露而不能吃时，不产生额外局面身份（与 FIDE 口径一致）。
- **升变选择**：弹窗确认后走子才提交；取消不会留下幽灵子节点。四种升变互为独立分支。
- **界面提示**：合法落点（圆点/吃子环）、上一手高亮、将军格红底、将死/逼和/将军、
  当前局面三次重复可申领状态；不处理 50 回合、协议和棋、子力不足等其他和棋条件。
- **可复核的合法后续**：每个节点列出全部合法走法，已建过变例的做标记并可直接进入。

## 开发

```bash
npm install --legacy-peer-deps   # 当前 npm/ vitest 版本需要
npm run dev        # 本地开发
npm run build      # 生产构建（dist/，不含 chess.js）
npm run check      # svelte-check 类型检查
npm test           # vitest，全部用例
```

## 目录结构

```
src/lib/chess/
  types.ts       类型、坐标工具（sq = rank*8 + file）
  position.ts    攻击判定、伪合法/合法走子、易位、过路兵、升变、局面键
  fen.ts         FEN 前四域解析/序列化（测试装局面用）
  tree.ts        变例树 Svelte store：分支、回退、重复计数、200 节点上限
  oracle.ts      【仅测试】与 chess.js 对拍的适配层
  *.test.ts      引擎 / 树 / 随机对拍 / SSR 冒烟测试
src/lib/components/
  Board.svelte  PromotionPicker.svelte
  StatusPanel.svelte  VariationsPanel.svelte
src/App.svelte   布局与交互串联
```

## 关键规则口径

- **王安全**：所有伪合法走子执行后，检查己方王是否被攻击；过路兵走法会在临时棋盘上
  同时移除被吃兵后再判定，因此“吃过路兵导致车/后透线照王”会被正确判为非法。
- **易位权**：王或对应角车离开原位、或角车在原位被吃，即丧失相应一侧权利。
- **过路兵身份键**：`positionKey` 只在当前合法走子中确实存在吃过路兵着法时写入 ep 格，
  否则写 `-`。
- **重复计数**：新建节点时沿父链统计同身份键出现次数，天然按分支路径隔离。

## 测试

`chess.js` 仅作为测试中的独立对照库，应用与生产包不依赖它。

- `engine.test.ts`：过路兵移除导致透线将军、易位经过/落子受攻击格、角上车被吃、
  王移动失权、升变、将死/逼和。
- `tree.test.ts`：分支回退兄弟隔离、ep/易位权路径独立、三次重复、升变取消无幽灵节点、
  200 节点上限、删支、真实对局走到升变点。
- `fuzz.test.ts`：20 个可复现随机种子 × 多种战术局面，逐步与 chess.js 对拍
  合法走子集合和走后身份键。
- `app.ssr.test.ts`：完整 Svelte 应用 SSR 冒烟。


Variation transplant: move an existing non-root subtree under another node. Retain IDs, moves, current selection and unrelated branches. All descendant moves must be legal from the new ancestry; reject the whole operation for any illegal continuation, cycle or duplicate child move. Repetition and rule state are defined by the resulting ancestor path. Moving to the current parent is a no-op.
