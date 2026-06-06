const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'assets');
const BG = '#0A0A0A';
const STATES = {
  idle: '#6F7782',
  game: '#00D4AA',
  error: '#FF4757'
};

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function hexToRgba(hex, alpha = 255) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    alpha
  ];
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function setPixel(pixels, width, x, y, rgba) {
  const index = (y * width + x) * 4;
  pixels[index] = rgba[0];
  pixels[index + 1] = rgba[1];
  pixels[index + 2] = rgba[2];
  pixels[index + 3] = rgba[3];
}

function renderMark(width, height, accentHex) {
  const pixels = Buffer.alloc(width * height * 4);
  const bg = hexToRgba(BG);
  const accent = hexToRgba(accentHex);
  const soft = hexToRgba(accentHex, 70);
  const cx = width / 2;
  const cy = height / 2;
  const side = Math.min(width, height);
  const outer = [
    [cx, cy - side * 0.42],
    [cx + side * 0.34, cy - side * 0.19],
    [cx + side * 0.29, cy + side * 0.2],
    [cx, cy + side * 0.43],
    [cx - side * 0.29, cy + side * 0.2],
    [cx - side * 0.34, cy - side * 0.19]
  ];
  const inner = [
    [cx, cy - side * 0.25],
    [cx + side * 0.2, cy - side * 0.11],
    [cx + side * 0.17, cy + side * 0.12],
    [cx, cy + side * 0.27],
    [cx - side * 0.17, cy + side * 0.12],
    [cx - side * 0.2, cy - side * 0.11]
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      setPixel(pixels, width, x, y, bg);
      const dx = x - cx;
      const dy = y - cy;
      const halo = Math.sqrt(dx * dx + dy * dy) < side * 0.48;
      if (halo && ((x + y) % 5 === 0)) {
        setPixel(pixels, width, x, y, soft);
      }
      if (pointInPolygon(x, y, outer)) {
        setPixel(pixels, width, x, y, accent);
      }
      if (pointInPolygon(x, y, inner)) {
        setPixel(pixels, width, x, y, bg);
      }
      const barWidth = Math.max(1, side * 0.045);
      const barTop = cy - side * 0.08;
      const barBottom = cy + side * 0.18;
      const inBars = y >= barTop && y <= barBottom && (
        Math.abs(x - (cx - side * 0.08)) < barWidth ||
        Math.abs(x - cx) < barWidth ||
        Math.abs(x - (cx + side * 0.08)) < barWidth
      );
      if (inBars) {
        setPixel(pixels, width, x, y, accent);
      }
    }
  }
  return pixels;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createPng(width, height, accentHex) {
  const pixels = renderMark(width, height, accentHex);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function createIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  const entries = [];
  let offset = 6 + frames.length * 16;
  for (const frame of frames) {
    const entry = Buffer.alloc(16);
    entry[0] = frame.width >= 256 ? 0 : frame.width;
    entry[1] = frame.height >= 256 ? 0 : frame.height;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(frame.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += frame.data.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...frames.map((frame) => frame.data)]);
}

function logoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160" viewBox="0 0 640 160" role="img" aria-label="Esports Isolator PRO">
  <rect width="640" height="160" fill="${BG}"/>
  <path d="M82 22 130 48v38c0 33-19 57-48 66-29-9-48-33-48-66V48l48-26Z" fill="${STATES.game}"/>
  <path d="M82 48 108 62v22c0 18-9 32-26 39-17-7-26-21-26-39V62l26-14Z" fill="${BG}"/>
  <path d="M68 78h8v32h-8zm10 0h8v32h-8zm10 0h8v32h-8z" fill="${STATES.game}"/>
  <text x="164" y="79" fill="#E8E8EC" font-family="Inter, Segoe UI, sans-serif" font-size="30" font-weight="700" letter-spacing="2">ESPORTS ISOLATOR</text>
  <text x="164" y="112" fill="${STATES.game}" font-family="JetBrains Mono, Consolas, monospace" font-size="24" font-weight="700" letter-spacing="6">PRO</text>
</svg>
`;
}

function traySvg(state, accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" role="img" aria-label="Esports Isolator PRO ${state}">
  <rect width="32" height="32" rx="6" fill="${BG}"/>
  <path d="M16 4 26 9v7c0 6.3-4 10.8-10 12-6-1.2-10-5.7-10-12V9l10-5Z" fill="${accent}"/>
  <path d="M16 8 22 11.1v4.7c0 3.7-2.2 6.4-6 7.4-3.8-1-6-3.7-6-7.4v-4.7L16 8Z" fill="${BG}"/>
  <path d="M12.5 14h2v6h-2zm3.2-1.4h2v7.4h-2zm3.2 2.2h2V20h-2z" fill="${accent}"/>
</svg>
`;
}

function writeFile(name, data) {
  fs.writeFileSync(path.join(OUT_DIR, name), data);
}

function main() {
  ensureOutDir();
  writeFile('logo.svg', logoSvg());

  const appFrames = [16, 24, 32, 48, 64, 128, 256].map((size) => ({
    width: size,
    height: size,
    data: createPng(size, size, STATES.game)
  }));
  writeFile('icon.ico', createIco(appFrames));
  writeFile('icon.png', createPng(256, 256, STATES.game));
  writeFile('installer.png', createPng(512, 512, STATES.game));
  writeFile('splash-logo.png', createPng(512, 192, STATES.game));

  for (const [state, accent] of Object.entries(STATES)) {
    writeFile(`tray-${state}.svg`, traySvg(state, accent));
    const frame16 = createPng(16, 16, accent);
    const frame32 = createPng(32, 32, accent);
    writeFile(`tray-${state}-16.png`, frame16);
    writeFile(`tray-${state}-32.png`, frame32);
    writeFile(`tray-${state}.ico`, createIco([
      { width: 16, height: 16, data: frame16 },
      { width: 32, height: 32, data: frame32 }
    ]));
  }
}

main();
