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


  function pickRandom(arr, rng) {
    return arr[rng.int(arr.length)] 
  }

  function pickDecorations(maze, rng) {
    const names = [
      "princess",
      "gold",
      "monster",
      "prince",
      "flower",
      "ladder",
      "book",
      "potion",
      "diamond"
    ];

    const count = 5 + rng.int(3); // 5 to 7
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
    const { cols, north, south, east, west } = maze;
    const total = maze.cols * maze.rows;
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

  function drawMaze(
    canvas,
    maze,
    startOpening,
    endOpening,
    decorations,
    tracePoints = [],
    fadingTraces = [],
    activeTraceColor = "rgba(110, 65, 30, 0.72)"
  ) {
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
    ctx.strokeStyle = "#4b3a2a";
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

    drawDecorations(ctx, decorations, maze, cellW, cellH, innerX, innerY);
    for (const oldTrace of fadingTraces) {
        drawTrace(ctx, oldTrace.points, oldTrace.color, oldTrace.alpha);
      }

      drawTrace(ctx, tracePoints, activeTraceColor, 1);
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

  function drawTrace(ctx, tracePoints, color = "rgba(110, 65, 30, 0.72)", alpha = 1) {
    if (!tracePoints || tracePoints.length < 2) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(tracePoints[0].x, tracePoints[0].y);

    for (let i = 1; i < tracePoints.length; i++) {
      ctx.lineTo(tracePoints[i].x, tracePoints[i].y);
    }

    ctx.stroke();
    ctx.restore();
  }

  function wobblyLine(ctx, x0, y0, x1, y1) {
    const midX = (x0 + x1) / 2 + (Math.random() - 0.5) * 1.5;
    const midY = (y0 + y1) / 2 + (Math.random() - 0.5) * 1.5;

    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(midX, midY, x1, y1);
  }

  async function setupMaze(root) {
    const canvas = root.querySelector("[data-maze-canvas]");
    if (!canvas) return;

    const isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;

    if (!isTouchDevice) {
      canvas.style.cursor = "crosshair";
      canvas.style.touchAction = "none";
    }

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

    const captionEl = document.getElementById("maze-caption");

    if (captionEl && decorations.length > 0) {
      const example = pickRandom(decorations, rng);

      const labelMap = {
        flower: "a red flower. It seems to glow in the dark.",
        gold: "a bunch of coins, of uncertain value.",
        monster: "a creature. Friend or foe?",
        prince: "a chest. What may it contain?",
        princess: "a yellow flower. Oh that smell!",
        ladder: "a key. What does it unlock?",
        book: "an old book. The script is unfamiliar.",
        potion: "a small vial. Unlabeled.",
        diamond: "a precious diamond. Or maybe glass?",
      };

      const name = labelMap[example.name] || example.name;

    captionEl.innerHTML =
      `Something is here. You might find ${name} ` +
      `<img src="${example.src}" alt="${name}" style="vertical-align: middle; margin-left: 0.4em;">`;
        }

    await preloadImages(decorations.map(d => d.src));

    let isTracing = false;
    const tracePoints = [];
    const fadingTraces = [];

    const traceColors = [
      "rgba(110, 65, 30, 0.75)",
      "rgba(150, 90, 40, 0.75)",
      "rgba(120, 40, 40, 0.75)",
      "rgba(90, 80, 40, 0.75)",
      "rgba(70, 55, 110, 0.75)"
    ];

    let activeTraceColor = traceColors[Math.floor(Math.random() * traceColors.length)];
    let fadeTimer = null;

    function redraw() {
      drawMaze(
        canvas,
        maze,
        start,
        end,
        decorations,
        tracePoints,
        fadingTraces,
        activeTraceColor
      );
    }

    function startFadeLoop() {
      if (fadeTimer) return;

      fadeTimer = window.setInterval(() => {
        for (let i = fadingTraces.length - 1; i >= 0; i--) {
          fadingTraces[i].alpha -= 0.0005;
          if (fadingTraces[i].alpha <= 0) {
            fadingTraces.splice(i, 1);
          }
        }

        if (fadingTraces.length === 0) {
          clearInterval(fadeTimer);
          fadeTimer = null;
        }

        redraw();
      }, 50);
    }

    function getCanvasPoint(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
    }

    function appendTracePoint(point) {
      const last = tracePoints[tracePoints.length - 1];
      if (!last) {
        tracePoints.push(point);
        return true;
      }

      const dx = point.x - last.x;
      const dy = point.y - last.y;
      if ((dx * dx) + (dy * dy) >= 4) {
        tracePoints.push(point);
        return true;
      }

      return false;
    }

    if (!isTouchDevice) {
      canvas.addEventListener("pointerdown", (event) => {
        if (tracePoints.length > 1) {
          fadingTraces.push({
            points: tracePoints.slice(),
            color: activeTraceColor,
            alpha: 0.45
          });
          startFadeLoop();
        }

        isTracing = true;
        tracePoints.length = 0;
        activeTraceColor = traceColors[Math.floor(Math.random() * traceColors.length)];

        appendTracePoint(getCanvasPoint(event));

        if (canvas.setPointerCapture) {
          canvas.setPointerCapture(event.pointerId);
        }

        redraw();
      });

      canvas.addEventListener("pointermove", (event) => {
        if (!isTracing) return;
        if (appendTracePoint(getCanvasPoint(event))) {
          redraw();
        }
      });

      function stopTracing(event) {
        if (!isTracing) return;
        isTracing = false;

        if (tracePoints.length > 1) {
          fadingTraces.push({
            points: tracePoints.slice(),
            color: activeTraceColor,
            alpha: 0.45
          });
          tracePoints.length = 0;
          startFadeLoop();
        }

        if (event && canvas.releasePointerCapture) {
          try {
            canvas.releasePointerCapture(event.pointerId);
          } catch (_) {
            // ignore
          }
        }

        redraw();
      }

      canvas.addEventListener("pointerup", stopTracing);
      canvas.addEventListener("pointercancel", stopTracing);
    }

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