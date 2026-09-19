import { Platform, Text, useColorScheme, useWindowDimensions, View } from "react-native";
import Animated, { css, cubicBezier, useReducedMotion } from "react-native-reanimated";

import { useColors, type Colors } from "@/constants/colors";

const CELL_ASPECT = 2;
const MONO_ADVANCE = 0.6;

const HALF_WIDTH = 2.05;
const RING_INNER = 1.22;
const GAP_INNER = 1.58;
const GAP_OUTER = 1.65;
const RING_OUTER = 1.95;
const SHADE = ".:-=+*#%@";

type Vec = [number, number, number];
type Kind = "planet" | "ring" | "star";
type Run = { kind: Kind; text: string };
type Scene = { cols: number; rows: number; withPlanet: boolean };

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function normalize(v: Vec): Vec {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}

const ELEVATION = (30 * Math.PI) / 180;
const ROLL = (-20 * Math.PI) / 180;
const RING_NORMAL: Vec = [
  -Math.cos(ELEVATION) * Math.sin(ROLL),
  Math.cos(ELEVATION) * Math.cos(ROLL),
  Math.sin(ELEVATION),
];
const LIGHT = normalize([-0.45, 0.45, 0.95]);

function hash(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function inPlanetShadow(p: Vec): boolean {
  const t = -dot(p, LIGHT);
  const nearest: Vec = [p[0] + t * LIGHT[0], p[1] + t * LIGHT[1], p[2] + t * LIGHT[2]];
  return t > 0 && dot(nearest, nearest) < 1;
}

function cell(scene: Scene, i: number, j: number, inkIsLight: boolean): [string, Kind] {
  const sx = HALF_WIDTH / (scene.cols / 2);
  const x = (i + 0.5 - scene.cols / 2) * sx;
  const y = (scene.rows / 2 - j - 0.5) * sx * CELL_ASPECT;

  const hitsPlanet = scene.withPlanet && x * x + y * y <= 1;
  const planetZ = hitsPlanet ? Math.sqrt(1 - x * x - y * y) : -Infinity;
  const ringPoint: Vec = [x, y, -(RING_NORMAL[0] * x + RING_NORMAL[1] * y) / RING_NORMAL[2]];
  const r = Math.hypot(...ringPoint);
  const onRing = r >= RING_INNER && r <= RING_OUTER && !(r > GAP_INNER && r < GAP_OUTER);

  if (onRing && ringPoint[2] > planetZ) {
    const faint = r < 1.34 || (scene.withPlanet && inPlanetShadow(ringPoint));
    return [faint ? "." : r < GAP_INNER ? "=" : "-", "ring"];
  }

  if (hitsPlanet) {
    const normal: Vec = [x, y, planetZ];
    const band = 0.82 + 0.18 * Math.cos(dot(normal, RING_NORMAL) * 11);
    const light = Math.min(1, (0.15 + 0.85 * Math.max(0, dot(normal, LIGHT))) * band);
    const ink = inkIsLight ? light : 1 - light;
    return [SHADE[Math.round(ink * (SHADE.length - 1))], "planet"];
  }

  const s = hash(i, j);
  return [s < 0.006 ? "*" : s < 0.018 ? "." : " ", "star"];
}

function draw(scene: Scene, inkIsLight: boolean): Run[][] {
  return Array.from({ length: scene.rows }, (_, j) => {
    const runs: Run[] = [];
    for (let i = 0; i < scene.cols; i++) {
      const [char, kind] = cell(scene, i, j, inkIsLight);
      const last = runs[runs.length - 1];
      if (last && (char === " " || last.kind === kind)) {
        last.text += char;
      } else {
        runs.push({ kind, text: char });
      }
    }
    return runs;
  });
}

type Art = { cols: number; onDark: Run[][]; onLight: Run[][] };

function render(scene: Scene): Art {
  return { cols: scene.cols, onDark: draw(scene, true), onLight: draw(scene, false) };
}

const PLANET = render({ cols: 52, rows: 19, withPlanet: true });
const EMPTY_ORBIT = render({ cols: 40, rows: 11, withPlanet: false });

export function AsciiPlanet() {
  return <AsciiArt art={PLANET} maxCellWidth={7} printIn />;
}

export function AsciiEmptyOrbit() {
  return <AsciiArt art={EMPTY_ORBIT} maxCellWidth={5.5} />;
}

const MONO_FONT = Platform.select({ ios: "Menlo", default: "monospace" });
const LINE_STAGGER_MS = 22;

function AsciiArt({
  art,
  maxCellWidth,
  printIn = false,
}: {
  art: Art;
  maxCellWidth: number;
  printIn?: boolean;
}) {
  const colors = useColors();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();

  const cellWidth = Math.min(maxCellWidth, (width - 48) / art.cols);
  const textStyle = {
    fontFamily: MONO_FONT,
    fontSize: cellWidth / MONO_ADVANCE,
    lineHeight: cellWidth * CELL_ASPECT,
  };
  const lines = useColorScheme() === "dark" ? art.onDark : art.onLight;

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: cellWidth * art.cols }}
    >
      {lines.map((runs, j) => (
        <Animated.Text
          key={j}
          allowFontScaling={false}
          numberOfLines={1}
          ellipsizeMode="clip"
          style={[
            textStyle,
            printIn && entrance.line,
            printIn && { animationDelay: reduced ? "0ms" : `${j * LINE_STAGGER_MS}ms` },
          ]}
        >
          {runs.map((run, k) => (
            <Text key={k} style={{ color: inkColor(run.kind, colors) }}>
              {run.text}
            </Text>
          ))}
        </Animated.Text>
      ))}
    </View>
  );
}

function inkColor(kind: Kind, colors: Colors): string {
  switch (kind) {
    case "planet":
      return colors.text;
    case "ring":
      return colors.accentText;
    case "star":
      return colors.textMuted;
  }
}

const entrance = css.create({
  line: {
    animationName: css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } }),
    animationDuration: "420ms",
    animationFillMode: "backwards",
    animationTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
  },
});
