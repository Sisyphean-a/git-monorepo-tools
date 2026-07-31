import type { CommitSummary } from '../domain/types.js';
import { C } from '../theme.js';

const LANE_WIDTH = 14;
const ROW_HEIGHT = 56;
const NODE_Y = 20;
const GRAPH_COLORS = [C.btnPrimary, C.aiAccent, C.added, C.modified, '#a78bfa', '#fb7185'];

export type GraphRow = {
  lane: number;
  lanesBefore: number;
  lanesAfter: number;
  parentLanes: number[];
  laneTargets: number[];
  hasIncoming: boolean;
};

export function buildCommitGraph(commits: CommitSummary[]): GraphRow[] {
  const rows: GraphRow[] = [];
  const lanes: string[] = [];

  for (const commit of commits) {
    let lane = lanes.indexOf(commit.hash);
    const hasIncoming = lane !== -1;
    if (!hasIncoming) {
      lane = lanes.length;
      lanes.push(commit.hash);
    }

    const lanesBefore = lanes.length;
    const parentLanes: number[] = [];
    const nextLanes = [...lanes];
    nextLanes.splice(lane, 1);

    for (const parentHash of commit.parentHashes ?? []) {
      const existingLane = nextLanes.indexOf(parentHash);
      if (existingLane !== -1) {
        parentLanes.push(existingLane);
        continue;
      }
      const parentLane = lane + parentLanes.length;
      nextLanes.splice(parentLane, 0, parentHash);
      parentLanes.push(parentLane);
    }

    rows.push({
      lane,
      lanesBefore,
      lanesAfter: nextLanes.length,
      parentLanes,
      laneTargets: lanes.map(hash => nextLanes.indexOf(hash)),
      hasIncoming,
    });
    lanes.splice(0, lanes.length, ...nextLanes);
  }

  return rows;
}

export function commitGraphWidth(laneCount: number) {
  return Math.max(1, laneCount) * LANE_WIDTH;
}

export function CommitGraphRow({ row, selected, laneCount }: { row: GraphRow; selected: boolean; laneCount: number }) {
  const width = commitGraphWidth(laneCount);
  const fromX = laneX(row.lane);
  const nodeColor = graphColor(row.lane);

  return (
    <div style={{ width, minWidth: width, height: ROW_HEIGHT }} aria-hidden="true">
      <svg width={width} height={ROW_HEIGHT} viewBox={`0 0 ${width} ${ROW_HEIGHT}`} style={{ display: 'block', overflow: 'visible' }}>
        {row.hasIncoming && <line x1={fromX} y1={0} x2={fromX} y2={NODE_Y} stroke={nodeColor} strokeWidth={1.8} />}
        {Array.from({ length: row.lanesBefore }, (_, lane) => {
          const targetLane = row.laneTargets[lane];
          if (lane === row.lane || targetLane === undefined || targetLane < 0) return null;
          return <line key={`pass-${lane}`} x1={laneX(lane)} y1={0} x2={laneX(targetLane)} y2={ROW_HEIGHT} stroke={graphColor(lane)} strokeWidth={1.5} opacity={0.8} />;
        })}
        {row.parentLanes.map(parentLane => (
          <line key={`parent-${parentLane}`} x1={fromX} y1={NODE_Y} x2={laneX(parentLane)} y2={ROW_HEIGHT} stroke={nodeColor} strokeWidth={1.8} />
        ))}
        <circle cx={fromX} cy={NODE_Y} r={selected ? 5 : 4} fill={selected ? nodeColor : C.panel2} stroke={nodeColor} strokeWidth={1.8} />
      </svg>
    </div>
  );
}

function laneX(lane: number) {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

function graphColor(lane: number) {
  return GRAPH_COLORS[lane % GRAPH_COLORS.length] ?? C.btnPrimary;
}
