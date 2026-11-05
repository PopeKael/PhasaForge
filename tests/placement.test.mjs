import test from "node:test";
import assert from "node:assert/strict";
import { placeNearAnchor } from "../src/placement.mjs";

test("positions beside an anchor and clamps to positive and negative work areas", () => {
  const screen = { x: 0, y: 0, width: 1920, height: 1040 };
  assert.deepEqual(placeNearAnchor({ x: 200, y: 100, width: 60, height: 24 }, screen, { width: 640, height: 480 }), { x: 270, y: 134 });
  assert.deepEqual(placeNearAnchor({ x: 1800, y: 900, width: 80, height: 20 }, screen, { width: 640, height: 480 }), { x: 1150, y: 410 });
  const leftMonitor = { x: -1600, y: -100, width: 1600, height: 900 };
  assert.deepEqual(placeNearAnchor({ x: -1580, y: -80, width: 40, height: 18 }, leftMonitor, { width: 640, height: 480 }), { x: -1530, y: -52 });
});
