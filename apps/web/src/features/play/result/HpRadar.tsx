import type { Metrics } from "@hero/engine";
import type { MetricKey } from "@hero/schema";

export const HP_RADAR_AXES: Array<{
  key: MetricKey;
  label: string;
  shortLabel: string;
}> = [
  { key: "safety", label: "Safety", shortLabel: "Safety" },
  { key: "awareness", label: "Awareness", shortLabel: "Awareness" },
  { key: "communication", label: "Communication", shortLabel: "Comm." },
  { key: "procedure", label: "Procedure", shortLabel: "Procedure" },
  { key: "challenge", label: "Challenge", shortLabel: "Challenge" },
];

const CENTER = 120;
const RADIUS = 78;
const LABEL_RADIUS = 104;

function clampMetric(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function radarPoint(
  value: number,
  index: number,
  radius = RADIUS,
): { x: number; y: number } {
  const angle = (-90 + index * (360 / HP_RADAR_AXES.length)) * (Math.PI / 180);
  const scaledRadius = radius * (clampMetric(value) / 100);

  return {
    x: CENTER + Math.cos(angle) * scaledRadius,
    y: CENTER + Math.sin(angle) * scaledRadius,
  };
}

function pointText(point: { x: number; y: number }): string {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

export function radarPolygonPoints(metrics: Metrics): string {
  return HP_RADAR_AXES.map((axis, index) =>
    pointText(radarPoint(metrics[axis.key], index)),
  ).join(" ");
}

function gridPolygon(percent: number): string {
  return HP_RADAR_AXES.map((_, index) =>
    pointText(radarPoint(percent, index)),
  ).join(" ");
}

function labelPoint(index: number): { x: number; y: number } {
  return radarPoint(100, index, LABEL_RADIUS);
}

function textAnchor(x: number): "start" | "middle" | "end" {
  if (x < CENTER - 8) return "end";
  if (x > CENTER + 8) return "start";
  return "middle";
}

export function HpRadar({ metrics }: { metrics: Metrics }) {
  const aria = HP_RADAR_AXES.map(
    (axis) => `${axis.label} ${Math.round(clampMetric(metrics[axis.key]))}`,
  ).join(", ");

  return (
    <div className="hp-radar-wrap">
      <svg
        className="hp-radar"
        viewBox="0 0 240 240"
        role="img"
        aria-label={`5대 학습행동 레이더: ${aria}`}
      >
        {[25, 50, 75, 100].map((level) => (
          <polygon
            key={level}
            className="hp-radar-grid"
            points={gridPolygon(level)}
          />
        ))}

        {HP_RADAR_AXES.map((axis, index) => {
          const end = radarPoint(100, index);
          const label = labelPoint(index);
          const value = Math.round(clampMetric(metrics[axis.key]));

          return (
            <g key={axis.key}>
              <line
                className="hp-radar-axis"
                x1={CENTER}
                y1={CENTER}
                x2={end.x}
                y2={end.y}
              />
              <text
                className="hp-radar-label"
                x={label.x}
                y={label.y}
                textAnchor={textAnchor(label.x)}
                dominantBaseline="middle"
              >
                {axis.shortLabel}
              </text>
              <text
                className="hp-radar-value"
                x={label.x}
                y={label.y + 12}
                textAnchor={textAnchor(label.x)}
                dominantBaseline="middle"
              >
                {value}
              </text>
            </g>
          );
        })}

        <polygon
          className="hp-radar-data"
          points={radarPolygonPoints(metrics)}
        />

        {HP_RADAR_AXES.map((axis, index) => {
          const point = radarPoint(metrics[axis.key], index);
          return (
            <circle
              key={axis.key}
              className="hp-radar-point"
              cx={point.x}
              cy={point.y}
              r="3.5"
            />
          );
        })}
      </svg>
    </div>
  );
}
