import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildProjectBoardOwnerExport,
  renderProjectBoardOwnerExport,
  runProjectBoardOwnerExport
} from "./export-project-board-owner.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roadmapPath = path.join(root, "docs/roadmap/FOUNDATION_ROADMAP.json");
const roadmapBytes = fs.readFileSync(roadmapPath);
const roadmap = JSON.parse(roadmapBytes.toString("utf8"));

test("exports six honest non-complete Foundation records", () => {
  const output = buildProjectBoardOwnerExport(roadmap, roadmapBytes);
  assert.equal(roadmap.workItems.length, 17);
  assert.equal(output.cards.length, 6);
  assert.deepEqual(
    output.cards.map((card) => card.record.card_id),
    ["FDN-204", "FDN-301", "FDN-701", "FDN-801", "FDN-901", "FDN-GOV-001"]
  );
  assert.ok(output.cards.every((card) => card.record.priority === null));
  assert.ok(output.cards.every((card) => card.record.source_ref.startsWith("repos/foundation/")));
  assert.equal(output.extensions.discord_mutation_authorized, false);
});

test("maps planned and planned-later work without inventing readiness", () => {
  const output = buildProjectBoardOwnerExport(roadmap, roadmapBytes);
  const cards = new Map(output.cards.map((card) => [card.record.card_id, card]));
  assert.equal(cards.get("FDN-204").record.lifecycle, "planning");
  assert.equal(cards.get("FDN-204").record_status, "active");
  assert.equal(cards.get("FDN-301").record.lifecycle, "intake");
  assert.equal(cards.get("FDN-301").record_status, "candidate");
});

test("normalizes CRLF before hashing", () => {
  const normalized = roadmapBytes.toString("utf8").replace(/\r\n?/g, "\n");
  const lf = buildProjectBoardOwnerExport(roadmap, Buffer.from(normalized));
  const crlf = buildProjectBoardOwnerExport(roadmap, Buffer.from(normalized.replace(/\n/g, "\r\n")));
  assert.equal(lf.source_revision, crlf.source_revision);
});

test("rejects duplicate identities and missing acceptance criteria", () => {
  const duplicate = structuredClone(roadmap);
  duplicate.workItems[1].id = duplicate.workItems[0].id;
  assert.throws(() => buildProjectBoardOwnerExport(duplicate, Buffer.from(JSON.stringify(duplicate))), /ids must be unique/);

  const missingCriteria = structuredClone(roadmap);
  missingCriteria.workItems.find((item) => item.id === "FDN-204").acceptanceCriteria = [];
  assert.throws(
    () => buildProjectBoardOwnerExport(missingCriteria, Buffer.from(JSON.stringify(missingCriteria))),
    /acceptanceCriteria must not be empty/
  );
});

test("check mode detects output drift", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "foundation-owner-export-"));
  try {
    fs.mkdirSync(path.join(tempRoot, "docs/roadmap"), { recursive: true });
    fs.copyFileSync(roadmapPath, path.join(tempRoot, "docs/roadmap/FOUNDATION_ROADMAP.json"));
    runProjectBoardOwnerExport([], tempRoot);
    assert.doesNotThrow(() => runProjectBoardOwnerExport(["--check"], tempRoot));
    fs.writeFileSync(path.join(tempRoot, "exports/foundation.project-board.owner-export.v1.json"), "{}\n");
    assert.throws(() => runProjectBoardOwnerExport(["--check"], tempRoot), /is stale/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("committed export matches deterministic rendering", () => {
  const expected = renderProjectBoardOwnerExport(root);
  const actual = fs.readFileSync(path.join(root, "exports/foundation.project-board.owner-export.v1.json"), "utf8");
  assert.equal(actual, expected);
});
