(() => {
  "use strict";

  const symbolImages = new Map();

  function loadImage(src) {
    if (symbolImages.has(src)) {
      return symbolImages.get(src);
    }

    const img = new Image();
    const promise = new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = reject;
    });

    img.src = src;
    const entry = { img, promise };
    symbolImages.set(src, entry);
    return entry;
  }

  async function preloadImages(sources) {
    const unique = [...new Set(sources)];
    await Promise.all(unique.map(src => loadImage(src).promise));
  }

  class RNG {
    constructor(seed) {
      this.seed = seed >>> 0;
    }

    next() {
      let x = this.seed;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.seed = x >>> 0;
      return this.seed / 4294967296;
    }

    int(max) {
      return Math.floor(this.next() * max);
    }
  }

  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function pickDecorations(maze, rng) {
    const names = [
      "princess",
      "gold",
      "monster",
      "prince",
      "flower",
      "stairs",
      "book",
      "potion",
      "diamond"
    ];

    const count = 5 + rng.int(3); // 3 to 5
    const decorations = [];

    for (let i = 0; i < count; i++) {
      const cell = rng.int(maze.cols * maze.rows);
      const name = names[rng.int(names.length)];

      decorations.push({
        cell,
        name,
        src: `/img/maze/${name}.svg`,
        rotation: (rng.next() - 0.5) * 0.25
      });
    }

    return decorations;
  }

  function buildMaze(cols, rows, rng) {
    const total = cols * rows;
    const visited = new Uint8Array(total);
    const north = new Uint8Array(total);
    const south = new Uint8Array(total);
    const east = new Uint8Array(total);
    const west = new Uint8Array(total);
    const stack = new Int32Array(total);

    let top = 0;
    stack[top] = 0;
    visited[0] = 1;

    while (top >= 0) {
      const current = stack[top];
      const x = current % cols;
      const y = (current / cols) | 0;

      const neighbors = [];

      if (y > 0) {
        const n = current - cols;
        if (!visited[n]) neighbors.push([n, 0]);
      }
      if (x < cols - 1) {
        const e = current + 1;
        if (!visited[e]) neighbors.push([e, 1]);
      }
      if (y < rows - 1) {
        const s = current + cols;
        if (!visited[s]) neighbors.push([s, 2]);
      }
      if (x > 0) {
        const w = current - 1;
        if (!visited[w]) neighbors.push([w, 3]);
      }

      if (neighbors.length === 0) {
        top--;
        continue;
      }

      const [next, dir] = neighbors[rng.int(neighbors.length)];
      visited[next] = 1;

      if (dir === 0) {
        north[current] = 1;
        south[next] = 1;
      } else if (dir === 1) {
        east[current] = 1;
        west[next] = 1;
      } else if (dir === 2) {
        south[current] = 1;
        north[next] = 1;
      } else {
        west[current] = 1;
        east[next] = 1;
      }

      top++;
      stack[top] = next;
    }

    return { cols, rows, north, south, east, west };
  }

  function bfsDistances(maze, start) {
    const { cols, rows, north, south, east, west } = maze;
    const total = cols * rows;
    const dist = new Int32Array(total);
    dist.fill(-1);

    const queue = new Int32Array(total);
    let qh = 0;
    let qt = 0;

    dist[start] = 0;
    queue[qt++] = start;

    while (qh < qt) {
      const cur = queue[qh++];
      const d = dist[cur];

      if (north[cur]) {
        const n = cur - cols;
        if (dist[n] === -1) {
          dist[n] = d + 1;
          queue[qt++] = n;
        }
      }
      if (east[cur]) {
        const e = cur + 1;
        if (dist[e] === -1) {
          dist[e] = d + 1;
          queue[qt++] = e;
        }
      }
      if (south[cur]) {
        const s = cur + cols;
        if (dist[s] === -1) {
          dist[s] = d + 1;
          queue[qt++] = s;
        }
      }
      if (west[cur]) {
        const w = cur - 1;
        if (dist[w] === -1) {
          dist[w] = d + 1;
          queue[qt++] = w;
        }
      }
    }

    return dist;
  }

  function pickNorthSouthEndpoints(maze) {
    const { cols, rows } = maze;

    const northCandidates = [];
    const southCandidates = [];

    for (let x = 0; x < cols; x++) {
      northCandidates.push({ cell: x, side: "north" });
      southCandidates.push({ cell: (rows - 1) * cols + x, side: "south" });
    }

    let bestStart = northCandidates[0];
    let bestEnd = southCandidates[0];
    let bestDist = -1;

    for (const start of northCandidates) {
      const dist = bfsDistances(maze, start.cell);
      for (const end of southCandidates) {
        const d = dist[end.cell];
        if (d > bestDist) {
          bestDist = d;
          bestStart = start;
          bestEnd = end;
        }
      }
    }

    return { start: bestStart, end: bestEnd };
  }

  function openBoundary(maze, cell, side) {
    if (side === "north") maze.north[cell] = 1;
    if (side === "south") maze.south[cell] = 1;
    if (side === "east") maze.east[cell] = 1;
    if (side === "west") maze.west[cell] = 1;
  }

  function drawArrow(ctx, x, y, direction, color, size) {
    ctx.save();
    ctx.translate(x, y);

    let angle = 0;
    if (direction === "down") angle = Math.PI / 2;
    if (direction === "up") angle = -Math.PI / 2;
    if (direction === "left") angle = Math.PI;
    if (direction === "right") angle = 0;

    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.55, -size * 0.72);
    ctx.lineTo(-size * 0.55, -size * 0.28);
    ctx.lineTo(-size * 1.1, -size * 0.28);
    ctx.lineTo(-size * 1.1, size * 0.28);
    ctx.lineTo(-size * 0.55, size * 0.28);
    ctx.lineTo(-size * 0.55, size * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawMaze(canvas, maze, startOpening, endOpening, decorations) {
    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    const rect = canvas.parentElement.getBoundingClientRect();
    const cssWidth = Math.max(320, Math.floor(rect.width || 800));
    const cssHeight = Math.max(260, Math.floor(cssWidth * (maze.rows / maze.cols)));

    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const bg = ctx.createLinearGradient(0, 0, 0, cssHeight);
    bg.addColorStop(0, "#f4ecd8");
    bg.addColorStop(0.5, "#e9dcc2");
    bg.addColorStop(1, "#d8c7a3");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const pad = Math.max(10, Math.min(cssWidth, cssHeight) * 0.025);
    const innerX = pad;
    const innerY = pad;
    const innerW = cssWidth - 2 * pad;
    const innerH = cssHeight - 2 * pad;

    const cellW = innerW / maze.cols;
    const cellH = innerH / maze.rows;

    const wallWidth = Math.max(1, Math.min(cellW, cellH) * 0.13);

    ctx.lineWidth = wallWidth;
    ctx.strokeStyle = "#4b3a2a"; // ink brown
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    for (let y = 0; y < maze.rows; y++) {
      for (let x = 0; x < maze.cols; x++) {
        const i = y * maze.cols + x;
        const x0 = innerX + x * cellW;
        const y0 = innerY + y * cellH;
        const x1 = x0 + cellW;
        const y1 = y0 + cellH;

        if (!maze.north[i]) {
          wobblyLine(ctx, x0, y0, x1, y0);
        }
        if (!maze.west[i]) {
          wobblyLine(ctx, x0, y0, x0, y1);
        }
        if (x === maze.cols - 1 && !maze.east[i]) {
          wobblyLine(ctx, x1, y0, x1, y1);
        }
        if (y === maze.rows - 1 && !maze.south[i]) {
          wobblyLine(ctx, x0, y1, x1, y1);
        }
      }
    }

    ctx.stroke();

    const startX = innerX + ((startOpening.cell % maze.cols) + 0.5) * cellW;
    const startY = innerY + Math.max(cellH * 0.65, 10);

    const endX = innerX + ((endOpening.cell % maze.cols) + 0.5) * cellW;
    const endY = innerY + innerH - Math.max(cellH * 0.65, 10);

    const arrowSize = Math.max(6, Math.min(cellW, cellH) * 0.9);

    drawDecorations(ctx, decorations, maze, cellW, cellH, innerX, innerY);

  }

  function drawDecorations(ctx, decorations, maze, cellW, cellH, offsetX, offsetY) {
    for (const deco of decorations) {
      const x = deco.cell % maze.cols;
      const y = (deco.cell / maze.cols) | 0;

      const cx = offsetX + (x + 0.5) * cellW;
      const cy = offsetY + (y + 0.5) * cellH;

      const size = Math.min(cellW, cellH) * 0.9;
      drawSymbolImage(ctx, deco.src, cx, cy, size, deco.rotation);
    }
  }

  function drawSymbolImage(ctx, src, x, y, size, rotation = 0) {
    const entry = symbolImages.get(src);
    if (!entry || !entry.img.complete) return;

    const img = entry.img;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    const w = size * 2.2;
    const h = size * 2.2;

    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function wobblyLine(ctx, x0, y0, x1, y1) {
    const dx = x1 - x0;
    const dy = y1 - y0;

    const midX = (x0 + x1) / 2 + (Math.random() - 0.5) * 1.5;
    const midY = (y0 + y1) / 2 + (Math.random() - 0.5) * 1.5;

    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(midX, midY, x1, y1);
  }

  async function setupMaze(root) {
    const canvas = root.querySelector("[data-maze-canvas]");
    if (!canvas) return;

    const cols = Number(root.dataset.cols || 96);
    const rows = Number(root.dataset.rows || 108);
    const seedText =
      root.dataset.seed ||
      `${window.location.pathname}|${Date.now()}|${Math.random()}`;

    const rng = new RNG(hashString(seedText));
    const maze = buildMaze(cols, rows, rng);

    const { start, end } = pickNorthSouthEndpoints(maze);
    openBoundary(maze, start.cell, "north");
    openBoundary(maze, end.cell, "south");

    const decorations = pickDecorations(maze, rng);

    await preloadImages(decorations.map(d => d.src));

    const redraw = () => drawMaze(canvas, maze, start, end, decorations);
    redraw();

    let resizeTimer = null;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(redraw, 80);
      },
      { passive: true }
    );
  }

  function init() {
    document.querySelectorAll("[data-home-maze]").forEach(setupMaze);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();