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
