import { applyMove, evaluatePosition, findLegalMove, moveId } from "./position";
import type { TreeData, VNode } from "./tree";

/** Move an existing subtree. Node identities and unrelated branches are retained. */
export function transplant(
  data: TreeData,
  sourceId: number,
  targetId: number,
): TreeData {
  const source = data.nodes[sourceId],
    target = data.nodes[targetId];
  if (!source || !target || source.parentId === null)
    throw new Error("Invalid branch");
  const order: number[] = [],
    seen = new Set<number>(),
    todo = [sourceId];
  while (todo.length) {
    const id = todo.pop()!;
    if (seen.has(id)) throw new Error("Cyclic branch");
    seen.add(id);
    order.push(id);
    todo.push(...data.nodes[id].childrenIds.slice().reverse());
  }
  if (seen.has(targetId)) throw new Error("Target is inside branch");
  if (source.parentId === targetId) return data;
  if (target.childByMove[moveId(source.move!)] !== undefined)
    throw new Error("Duplicate move");
  const nodes: Record<number, VNode> = { ...data.nodes };
  for (const id of order) {
    const old = data.nodes[id];
    const parentId = id === sourceId ? targetId : old.parentId!;
    const parent = nodes[parentId];
    const spec = old.move!;
    const legal = findLegalMove(
      parent.position,
      spec.from,
      spec.to,
      spec.promotion,
    );
    if (!legal) break;
    const position = old.position;
    let repCount = old.repCount,
      ancestor: VNode | undefined = undefined;
    const ancestors = new Set<number>();
    while (ancestor) {
      if (ancestors.has(ancestor.id)) throw new Error("Cyclic ancestry");
      ancestors.add(ancestor.id);
      if (ancestor.position.key === position.key) repCount++;
      ancestor =
        ancestor.parentId === null ? undefined : nodes[ancestor.parentId];
    }
    nodes[id] = {
      ...old,
      parentId,
      move: legal,
      position,
      repCount,
      childrenIds: [...old.childrenIds],
      childByMove: { ...old.childByMove },
    };
  }
  const oldParent = nodes[source.parentId];
  nodes[oldParent.id] = {
    ...oldParent,
    childrenIds: oldParent.childrenIds.filter((id) => id !== sourceId),
    childByMove: Object.fromEntries(
      Object.entries(oldParent.childByMove).filter(([, id]) => id !== sourceId),
    ),
  };
  nodes[targetId] = {
    ...nodes[targetId],
    childrenIds: [...target.childrenIds, sourceId],
    childByMove: {
      ...target.childByMove,
      [moveId(nodes[sourceId].move!)]: sourceId,
    },
  };
  return { ...data, nodes };
}
