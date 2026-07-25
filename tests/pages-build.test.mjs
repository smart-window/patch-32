import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("builds a standalone GitHub Pages game", async () => {
  await access(new URL("../dist/index.html", import.meta.url));
  await access(new URL("../dist/og.png", import.meta.url));
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(html, /PATCH\/\/32/);
  assert.match(html, /smart-window\.github\.io\/patch-32/);
  assert.doesNotMatch(html, /chatgpt\.site|codex-preview/i);
});

test("warns players before each edge surge", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /SURGE_WARNING_SECONDS = 3/);
  assert.match(source, /EDGE SURGE IN \$\{surgeCountdown\}/);
  assert.match(source, /lastSurgeWarningRef\.current !== wholeSecond/);
});

test("explains rejected low-charge patch attempts", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /RECHARGING · \$\{missingCharge\} CHARGE TO GO/);
  assert.match(source, /RECHARGING · \$\{Math\.ceil\(PATCH_COST - charge\)\} TO GO/);
  assert.equal(source.match(/setCharge\(chargeRef\.current\)/g)?.length, 2);
  assert.doesNotMatch(source, /setCharge\(Math\.round\(chargeRef\.current\)\)/);
  assert.match(source, /<b>\{Math\.round\(charge\)\}%<\/b>/);
});

test("does not award points for empty patches", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /scoreRef\.current \+= repaired > 0 \? 12 \+ combo : 0/);
  assert.match(source, /EMPTY PATCH · NO SCORE/);
});

test("protects newcomers from one empty first patch", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /firstPatchProtectedRef\.current = true/);
  assert.match(source, /firstPatchProtectedRef\.current && repaired === 0/);
  assert.match(source, /FIRST PATCH BLOCKED · AIM AT RED/);
  assert.match(
    source,
    /FIRST PATCH BLOCKED · AIM AT RED[\s\S]*return;[\s\S]*chargeRef\.current = clamp/,
  );
});

test("starts the keyboard cursor away from the protected center", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /const START_CURSOR = \{ x: 8, y: 8 \}/);
  assert.match(source, /useRef\(\{ \.\.\.START_CURSOR \}\)/);
  assert.match(source, /cursorRef\.current = \{ \.\.\.START_CURSOR \}/);
  assert.doesNotMatch(source, /cursorRef\.current = \{ x: 16, y: 16 \}/);
});

test("announces events without flooding screen readers with live metrics", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /<aside className="control-panel" aria-live=/);
  assert.match(source, /className="status-line"[\s\S]*role="status"[\s\S]*aria-atomic="true"/);
  assert.match(
    source,
    /role="progressbar"[\s\S]*aria-label="Network integrity"[\s\S]*aria-valuenow=\{integrity\}/,
  );
  assert.match(
    source,
    /role="progressbar"[\s\S]*aria-label="Patch charge"[\s\S]*aria-valuenow=\{Math\.round\(charge\)\}/,
  );
  assert.match(
    source,
    /className="sound-toggle"[\s\S]*aria-pressed=\{soundOn\}[\s\S]*onClick=\{toggleSound\}/,
  );
});

test("keeps every patch energy-negative before passive regeneration", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const patchCost = Number(source.match(/const PATCH_COST = (\d+)/)?.[1]);
  const refundCap = Number(source.match(/const PATCH_REFUND_CAP = (\d+)/)?.[1]);

  assert.match(source, /const STARTING_CHARGE = 52/);
  assert.match(source, /const CHARGE_REGEN_PER_SECOND = 3/);
  assert.equal(patchCost, 18);
  assert.equal(refundCap, 10);
  assert.ok(refundCap < patchCost);
  assert.match(source, /Math\.min\(repaired \* 1\.7, PATCH_REFUND_CAP\)/);
});

test("uses the isolated 48 percent loss-threshold experiment", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /const LOSS_THRESHOLD = 48/);
  assert.match(source, /nextIntegrity <= LOSS_THRESHOLD/);
  assert.doesNotMatch(source, /below 28%|above 28%|nextIntegrity <= 28/);
});
