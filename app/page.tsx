"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SIZE = 32;
const CELLS = SIZE * SIZE;
const ROUND_SECONDS = 75;
const LOSS_THRESHOLD = 48;
const STARTING_CHARGE = 52;
const PATCH_COST = 18;
const PATCH_REFUND_CAP = 10;
const CHARGE_REGEN_PER_SECOND = 3;
const TICK_MS = 120;
const SURGE_INTERVAL = 15;
const SURGE_WARNING_SECONDS = 3;
const START_CURSOR = { x: 8, y: 8 };

type GameStatus = "intro" | "playing" | "won" | "lost";
type Pulse = { x: number; y: number; born: number; power: number };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const indexOf = (x: number, y: number) => y * SIZE + x;
const patchRadius = (charge: number) => (charge > 72 ? 3 : 2);

function randomEdgeCell() {
  const edge = Math.floor(Math.random() * 4);
  const offset = Math.floor(Math.random() * SIZE);
  if (edge === 0) return [offset, 0] as const;
  if (edge === 1) return [SIZE - 1, offset] as const;
  if (edge === 2) return [offset, SIZE - 1] as const;
  return [0, offset] as const;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef(new Uint8Array(CELLS));
  const statusRef = useRef<GameStatus>("intro");
  const scoreRef = useRef(0);
  const chargeRef = useRef(STARTING_CHARGE);
  const timeRef = useRef(ROUND_SECONDS);
  const startRef = useRef(0);
  const cursorRef = useRef({ ...START_CURSOR });
  const pulsesRef = useRef<Pulse[]>([]);
  const lastWaveRef = useRef(ROUND_SECONDS);
  const lastSurgeWarningRef = useRef(0);
  const firstPatchProtectedRef = useRef(true);
  const soundRef = useRef(true);
  const audioRef = useRef<AudioContext | null>(null);

  const [status, setStatus] = useState<GameStatus>("intro");
  const [score, setScore] = useState(0);
  const [charge, setCharge] = useState(STARTING_CHARGE);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [integrity, setIntegrity] = useState(100);
  const [best, setBest] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [flash, setFlash] = useState("PATCH THE SIGNAL");

  const beep = useCallback((frequency: number, duration = 0.07) => {
    if (!soundRef.current || typeof window === "undefined") return;
    const AudioCtor = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;
    if (!audioRef.current) audioRef.current = new AudioCtor();
    const ctx = audioRef.current;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "square";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.025, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  }, []);

  const finish = useCallback(
    (next: "won" | "lost") => {
      if (statusRef.current !== "playing") return;
      statusRef.current = next;
      setStatus(next);
      const finalScore = scoreRef.current + (next === "won" ? 1200 : 0);
      scoreRef.current = finalScore;
      setScore(finalScore);
      setFlash(next === "won" ? "NEIGHBORHOOD ONLINE" : "SIGNAL LOST");
      beep(next === "won" ? 740 : 120, 0.25);
      const nextBest = Math.max(best, finalScore);
      setBest(nextBest);
      try {
        localStorage.setItem("patch32-best", String(nextBest));
      } catch {
        // The game remains fully playable if storage is unavailable.
      }
    },
    [beep, best],
  );

  const startGame = useCallback(() => {
    const grid = new Uint8Array(CELLS);
    for (let i = 0; i < 58; i += 1) {
      const [x, y] = randomEdgeCell();
      grid[indexOf(x, y)] = 2;
    }
    for (let i = 0; i < 10; i += 1) {
      const x = Math.floor(Math.random() * SIZE);
      const y = Math.floor(Math.random() * SIZE);
      grid[indexOf(x, y)] = 2;
    }
    grid[indexOf(15, 15)] = 3;
    grid[indexOf(16, 15)] = 3;
    grid[indexOf(15, 16)] = 3;
    grid[indexOf(16, 16)] = 3;
    gridRef.current = grid;
    scoreRef.current = 0;
    chargeRef.current = STARTING_CHARGE;
    timeRef.current = ROUND_SECONDS;
    startRef.current = performance.now();
    lastWaveRef.current = ROUND_SECONDS;
    lastSurgeWarningRef.current = 0;
    firstPatchProtectedRef.current = true;
    pulsesRef.current = [];
    cursorRef.current = { ...START_CURSOR };
    statusRef.current = "playing";
    setStatus("playing");
    setScore(0);
    setCharge(STARTING_CHARGE);
    setTimeLeft(ROUND_SECONDS);
    setIntegrity(93);
    setFlash("HOLD FOR 75 SECONDS");
    beep(330, 0.12);
  }, [beep]);

  const deployPatch = useCallback(
    (x: number, y: number) => {
      if (statusRef.current !== "playing") return;
      if (chargeRef.current < PATCH_COST) {
        const missingCharge = Math.ceil(PATCH_COST - chargeRef.current);
        setFlash(`RECHARGING · ${missingCharge} CHARGE TO GO`);
        return;
      }

      const grid = gridRef.current;
      let repaired = 0;
      const radius = patchRadius(chargeRef.current);
      const targets: number[] = [];
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (
            nx < 0 ||
            nx >= SIZE ||
            ny < 0 ||
            ny >= SIZE ||
            Math.hypot(dx, dy) > radius + 0.25
          )
            continue;
          const idx = indexOf(nx, ny);
          targets.push(idx);
          if (grid[idx] === 2) repaired += 1;
        }
      }

      if (firstPatchProtectedRef.current && repaired === 0) {
        firstPatchProtectedRef.current = false;
        setFlash("FIRST PATCH BLOCKED · AIM AT RED");
        beep(210);
        return;
      }
      firstPatchProtectedRef.current = false;
      for (const idx of targets) {
        if (grid[idx] !== 3) grid[idx] = 1;
      }

      chargeRef.current = clamp(
        chargeRef.current - PATCH_COST + Math.min(repaired * 1.7, PATCH_REFUND_CAP),
        0,
        100,
      );
      const combo = repaired >= 8 ? repaired * 8 : repaired * 4;
      scoreRef.current += repaired > 0 ? 12 + combo : 0;
      pulsesRef.current.push({ x, y, born: performance.now(), power: repaired });
      setCharge(chargeRef.current);
      setScore(scoreRef.current);
      setFlash(
        repaired >= 12
          ? `CHAIN PATCH ×${repaired}`
          : repaired > 0
            ? `REPAIRED ${repaired}`
            : "EMPTY PATCH · NO SCORE",
      );
      beep(repaired >= 8 ? 620 : repaired > 0 ? 460 : 180);
    },
    [beep],
  );

  useEffect(() => {
    try {
      setBest(Number(localStorage.getItem("patch32-best") || 0));
    } catch {
      setBest(0);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (statusRef.current !== "playing") return;
      const grid = gridRef.current;
      const elapsed = (performance.now() - startRef.current) / 1000;
      const remaining = Math.max(0, ROUND_SECONDS - elapsed);
      timeRef.current = remaining;

      const corrupt: number[] = [];
      for (let i = 0; i < CELLS; i += 1) {
        if (grid[i] === 2) corrupt.push(i);
        if (grid[i] === 1 && Math.random() < 0.008) grid[i] = 0;
      }

      const pressure = 2 + Math.floor(elapsed / 18);
      for (let attempt = 0; attempt < pressure; attempt += 1) {
        if (!corrupt.length) break;
        const source = corrupt[Math.floor(Math.random() * corrupt.length)];
        const sx = source % SIZE;
        const sy = Math.floor(source / SIZE);
        const direction = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ][Math.floor(Math.random() * 4)];
        const nx = sx + direction[0];
        const ny = sy + direction[1];
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
          const target = indexOf(nx, ny);
          if (grid[target] !== 3 && Math.random() < 0.68) grid[target] = 2;
        }
      }

      const wholeSecond = Math.ceil(remaining);
      const surgeCountdown = wholeSecond % SURGE_INTERVAL;
      if (
        wholeSecond > SURGE_INTERVAL &&
        surgeCountdown > 0 &&
        surgeCountdown <= SURGE_WARNING_SECONDS
      ) {
        setFlash(`EDGE SURGE IN ${surgeCountdown}`);
        if (lastSurgeWarningRef.current !== wholeSecond) {
          lastSurgeWarningRef.current = wholeSecond;
          beep(180 + (SURGE_WARNING_SECONDS - surgeCountdown) * 70, 0.08);
        }
      } else if (
        wholeSecond > 0 &&
        wholeSecond % SURGE_INTERVAL === 0 &&
        lastWaveRef.current !== wholeSecond
      ) {
        lastWaveRef.current = wholeSecond;
        for (let i = 0; i < 14; i += 1) {
          const [x, y] = randomEdgeCell();
          grid[indexOf(x, y)] = 2;
        }
        setFlash("EDGE SURGE INBOUND");
        beep(150, 0.16);
      }

      chargeRef.current = clamp(
        chargeRef.current + CHARGE_REGEN_PER_SECOND * (TICK_MS / 1000),
        0,
        100,
      );
      const corruptedCount = grid.reduce(
        (total, cell) => total + (cell === 2 ? 1 : 0),
        0,
      );
      const nextIntegrity = Math.round(100 - (corruptedCount / CELLS) * 100);
      setTimeLeft(Math.ceil(remaining));
      setCharge(chargeRef.current);
      setIntegrity(nextIntegrity);
      setScore(scoreRef.current);

      if (remaining <= 0) finish("won");
      else if (nextIntegrity <= LOSS_THRESHOLD) finish("lost");
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [beep, finish]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;
    const draw = () => {
      const scale = window.devicePixelRatio || 1;
      const displaySize = canvas.clientWidth;
      const targetSize = Math.max(320, Math.floor(displaySize * scale));
      if (canvas.width !== targetSize || canvas.height !== targetSize) {
        canvas.width = targetSize;
        canvas.height = targetSize;
      }
      const cell = canvas.width / SIZE;
      context.fillStyle = "#080a0d";
      context.fillRect(0, 0, canvas.width, canvas.height);

      const now = performance.now();
      for (let y = 0; y < SIZE; y += 1) {
        for (let x = 0; x < SIZE; x += 1) {
          const value = gridRef.current[indexOf(x, y)];
          const inset = Math.max(0.65 * scale, 1);
          if (value === 2) {
            const flicker = 70 + Math.floor(Math.sin(now / 90 + x * 2 + y) * 28);
            context.fillStyle = `rgb(${210 + flicker / 4}, ${20 + flicker / 9}, ${78 + flicker / 3})`;
          } else if (value === 1) {
            context.fillStyle = (x + y) % 3 === 0 ? "#63ffd4" : "#20c997";
          } else if (value === 3) {
            context.fillStyle = "#ffd166";
          } else {
            const tone = 17 + ((x * 7 + y * 3) % 7);
            context.fillStyle = `rgb(${tone}, ${tone + 4}, ${tone + 7})`;
          }
          context.fillRect(
            x * cell + inset,
            y * cell + inset,
            cell - inset * 2,
            cell - inset * 2,
          );
        }
      }

      const cursor = cursorRef.current;
      if (statusRef.current === "playing") {
        const previewRadius = patchRadius(chargeRef.current);
        context.beginPath();
        context.arc(
          (cursor.x + 0.5) * cell,
          (cursor.y + 0.5) * cell,
          cell * (previewRadius + 0.25),
          0,
          Math.PI * 2,
        );
        context.strokeStyle = "rgba(255, 255, 255, 0.48)";
        context.lineWidth = Math.max(scale, 1);
        context.stroke();
      }
      context.strokeStyle = "#ffffff";
      context.lineWidth = Math.max(1.5 * scale, 2);
      context.strokeRect(
        cursor.x * cell + 0.5 * scale,
        cursor.y * cell + 0.5 * scale,
        cell - scale,
        cell - scale,
      );

      pulsesRef.current = pulsesRef.current.filter((pulse) => now - pulse.born < 700);
      for (const pulse of pulsesRef.current) {
        const life = (now - pulse.born) / 700;
        context.beginPath();
        context.arc(
          (pulse.x + 0.5) * cell,
          (pulse.y + 0.5) * cell,
          cell * (0.5 + life * (pulse.power >= 8 ? 4.4 : 3.2)),
          0,
          Math.PI * 2,
        );
        context.strokeStyle = `rgba(99, 255, 212, ${1 - life})`;
        context.lineWidth = Math.max(1, (3 - life * 2) * scale);
        context.stroke();
      }

      animationFrame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === "Enter" && statusRef.current !== "playing") {
        startGame();
        return;
      }
      const cursor = cursorRef.current;
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w")
        cursor.y = (cursor.y + SIZE - 1) % SIZE;
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s")
        cursor.y = (cursor.y + 1) % SIZE;
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a")
        cursor.x = (cursor.x + SIZE - 1) % SIZE;
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d")
        cursor.x = (cursor.x + 1) % SIZE;
      if (event.key === " ") deployPatch(cursor.x, cursor.y);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [deployPatch, startGame]);

  const cursorFromPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clamp(
      Math.floor(((event.clientX - bounds.left) / bounds.width) * SIZE),
      0,
      SIZE - 1,
    );
    const y = clamp(
      Math.floor(((event.clientY - bounds.top) / bounds.height) * SIZE),
      0,
      SIZE - 1,
    );
    cursorRef.current = { x, y };
    return { x, y };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!event.isPrimary) return;
    const { x, y } = cursorFromPointer(event);
    if (event.pointerType === "touch") {
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    deployPatch(x, y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      event.isPrimary &&
      event.pointerType === "touch" &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      cursorFromPointer(event);
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      !event.isPrimary ||
      event.pointerType !== "touch" ||
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    const { x, y } = cursorFromPointer(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
    deployPatch(x, y);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const toggleSound = () => {
    soundRef.current = !soundRef.current;
    setSoundOn(soundRef.current);
    if (soundRef.current) beep(520);
  };

  return (
    <main className="game-shell">
      <header className="topbar">
        <a className="wordmark" href="#game" aria-label="PATCH 32 home">
          PATCH<span>//32</span>
        </a>
        <p className="topbar-copy">A TINY GAME ABOUT KEEPING SIGNALS ALIVE.</p>
        <button
          className="sound-toggle"
          type="button"
          aria-pressed={soundOn}
          onClick={toggleSound}
        >
          SOUND {soundOn ? "ON" : "OFF"}
        </button>
      </header>

      <section className="game-layout" id="game">
        <div className="board-column">
          <div className="board-frame">
            <div className="board-labels" aria-hidden="true">
              <span>32 × 32 LIVE PLOT</span>
              <span>NODE 0X20</span>
            </div>
            <div className="canvas-wrap">
              <canvas
                ref={canvasRef}
                className="game-canvas"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                tabIndex={0}
                aria-label="32 by 32 game board. Tap, or drag and release, on corrupted red cells to repair them."
              />
              {status !== "playing" && (
                <div className="game-overlay">
                  <p className="eyebrow">
                    {status === "intro" ? "NEIGHBORHOOD BOOT SEQUENCE" : "RUN COMPLETE"}
                  </p>
                  <h1>
                    {status === "won"
                      ? "SIGNAL\nHELD."
                      : status === "lost"
                        ? "PLOT\nOVERRUN."
                        : "PATCH\nTHE GRID."}
                  </h1>
                  <p className="overlay-copy">
                    {status === "intro"
                      ? "Corruption spreads from every edge. Patch clusters, recycle the energy, and keep this 32×32 neighborhood online for 75 seconds."
                      : status === "won"
                        ? `You kept the neighborhood alive. Final score: ${score.toLocaleString()}.`
                        : `The signal fell below ${LOSS_THRESHOLD}% integrity. Final score: ${score.toLocaleString()}.`}
                  </p>
                  <button className="primary-button" type="button" onClick={startGame}>
                    {status === "intro" ? "START PATCHING" : "RUN IT BACK"}
                    <span>↗</span>
                  </button>
                  <p className="keyboard-hint">TAP TO PLAY · OR ENTER / WASD / SPACE</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="control-panel">
          <div
            className="status-line"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className={status === "playing" ? "live-dot" : "live-dot idle"} />
            {flash}
          </div>

          <div className="metric-grid">
            <article>
              <span>TIME</span>
              <strong>{String(timeLeft).padStart(2, "0")}</strong>
              <small>SECONDS</small>
            </article>
            <article>
              <span>SCORE</span>
              <strong>{score.toLocaleString()}</strong>
              <small>BEST {best.toLocaleString()}</small>
            </article>
          </div>

          <div className="meter-block">
            <div className="meter-heading">
              <span>NETWORK INTEGRITY</span>
              <b>{integrity}%</b>
            </div>
            <div
              className="meter-track"
              role="progressbar"
              aria-label="Network integrity"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={integrity}
            >
              <i className="integrity-fill" style={{ width: `${integrity}%` }} />
            </div>
          </div>

          <div className="meter-block">
            <div className="meter-heading">
              <span>PATCH CHARGE</span>
              <b>{Math.round(charge)}%</b>
            </div>
            <div
              className="meter-track"
              role="progressbar"
              aria-label="Patch charge"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(charge)}
            >
              <i className="charge-fill" style={{ width: `${charge}%` }} />
            </div>
            <p className="meter-note">
              EACH PATCH COSTS {PATCH_COST}. CHAINS REFUND UP TO {PATCH_REFUND_CAP}.
            </p>
          </div>

          <div className="instructions">
            <p className="section-number">HOW TO HOLD THE PLOT / 03</p>
            <ol>
              <li>
                <b>01</b>
                <span>Tap a red cluster to deploy a cleansing patch.</span>
              </li>
              <li>
                <b>02</b>
                <span>Hit bigger clusters to earn combo points and charge.</span>
              </li>
              <li>
                <b>03</b>
                <span>
                  Keep integrity above {LOSS_THRESHOLD}% until the timer reaches zero.
                </span>
              </li>
            </ol>
          </div>

          <button
            className="mobile-patch"
            type="button"
            disabled={status !== "playing" || charge < PATCH_COST}
            onClick={() => deployPatch(cursorRef.current.x, cursorRef.current.y)}
          >
            {status === "playing" && charge < PATCH_COST
              ? `RECHARGING · ${Math.ceil(PATCH_COST - charge)} TO GO`
              : "PATCH CURSOR"}
          </button>
        </aside>
      </section>

      <footer>
        <p>ONE PLOT. 1,024 CELLS. ZERO LOGINS.</p>
        <p>MADE FOR VIBEBLITZ 2026</p>
      </footer>
    </main>
  );
}
