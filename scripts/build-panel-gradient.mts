import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const WIDTH = 4;
const HEIGHT = 1024;

const table = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  table[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = table[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function parseHex(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function render(from: string, to: string, out: string): void {
  const start = parseHex(from);
  const end = parseHex(to);
  const raw = Buffer.alloc(HEIGHT * (WIDTH * 3 + 1));
  const carry = [0, 0, 0];
  let offset = 0;

  for (let y = 0; y < HEIGHT; y += 1) {
    const t = HEIGHT === 1 ? 0 : y / (HEIGHT - 1);
    raw[offset] = 0;
    offset += 1;
    const row = [0, 0, 0];
    for (let channel = 0; channel < 3; channel += 1) {
      const exact = start[channel] + (end[channel] - start[channel]) * t + carry[channel];
      const quantized = Math.min(255, Math.max(0, Math.round(exact)));
      carry[channel] = exact - quantized;
      row[channel] = quantized;
    }
    for (let x = 0; x < WIDTH; x += 1) {
      raw[offset] = row[0];
      raw[offset + 1] = row[1];
      raw[offset + 2] = row[2];
      offset += 3;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  writeFileSync(out, png);
  console.log(`${out} ${WIDTH}x${HEIGHT} ${png.length} bytes`);
}

function schemeColors(source: string, scheme: string): [string, string] {
  const block = source.split(`const ${scheme}`)[1];
  if (!block) throw new Error(`no ${scheme} palette in colors.ts`);
  const raised = block.match(/raised:\s*"(#[0-9A-Fa-f]{6})"/)?.[1];
  const raisedShade = block.match(/raisedShade:\s*"(#[0-9A-Fa-f]{6})"/)?.[1];
  if (!raised || !raisedShade) throw new Error(`no raised colors in ${scheme} palette`);
  return [raised, raisedShade];
}

const tokens = readFileSync("src/constants/colors.ts", "utf8");
for (const scheme of ["dark", "light"]) {
  const [from, to] = schemeColors(tokens, scheme);
  render(from, to, `assets/images/panel-gradient-${scheme}.png`);
}
