import { describe, it } from "node:test";
import assert from "node:assert/strict";
import pkg from "../package.json" with { type: "json" };

describe("native TypeScript test harness", () => {
  it("runs typed assertions and JSON imports in Node", () => {
    const expectedName: string = "typo-thief";
    assert.equal(pkg.name, expectedName);
    assert.equal(pkg.type, "module");
  });
});
