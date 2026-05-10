import type {
  BoardItem,
  LaneConfig,
  LaneQuery,
  RenderedBoard,
  WorkflowConfig
} from "../shared/types.ts";

export function renderBoards(
  config: WorkflowConfig,
  items: BoardItem[],
  existingLabels: string[]
): RenderedBoard[] {
  const existingLabelSet = new Set(existingLabels);

  return config.boards.map((board) => {
    const boardItems = items.filter((item) => item.itemType === board.itemType);
    return {
      ...board,
      lanes: board.lanes.map((lane) => ({
        ...lane,
        items: boardItems.filter((item) => matchesLane(item, lane)),
        missingLabels: labelsForLane(lane).filter((label) => !existingLabelSet.has(label))
      }))
    };
  });
}

function matchesLane(item: BoardItem, lane: LaneConfig): boolean {
  return matchesQuery(item, lane.query);
}

function matchesQuery(item: BoardItem, query: LaneQuery): boolean {
  const labels = new Set(item.labels);

  if (query.labelsAll?.some((label) => !labels.has(label))) return false;
  if (query.labelsNone?.some((label) => labels.has(label))) return false;

  if (query.labelsAny?.length) {
    const hasAny = query.labelsAny.some((label) => labels.has(label));
    const canIncludeUnlabeled = query.includeUnlabeled === true && item.labels.length === 0;
    if (!hasAny && !canIncludeUnlabeled) return false;
  } else if (query.includeUnlabeled === true && item.labels.length > 0) {
    return false;
  }

  if (query.noAssignee === true && item.itemType === "issue" && item.assignees.length > 0) {
    return false;
  }

  if (query.isDraft !== undefined) {
    if (item.itemType !== "pullRequest" || item.isDraft !== query.isDraft) return false;
  }

  if (query.reviewDecisionAny?.length) {
    if (item.itemType !== "pullRequest") return false;
    if (!item.reviewDecision || !query.reviewDecisionAny.includes(item.reviewDecision)) return false;
  }

  return true;
}

function labelsForLane(lane: LaneConfig): string[] {
  return [
    ...(lane.query.labelsAll ?? []),
    ...(lane.query.labelsAny ?? []),
    ...(lane.query.labelsNone ?? [])
  ];
}

export function findItemsById(boards: RenderedBoard[], ids: string[]): BoardItem[] {
  const idSet = new Set(ids);
  const items: BoardItem[] = [];

  for (const board of boards) {
    for (const lane of board.lanes) {
      for (const item of lane.items) {
        if (idSet.has(item.id)) items.push(item);
      }
    }
  }

  return items;
}
