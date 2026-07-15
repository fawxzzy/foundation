#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROADMAP_PATH = "docs/roadmap/FOUNDATION_ROADMAP.json";
const ATLAS_ROADMAP_PATH = "repos/foundation/docs/roadmap/FOUNDATION_ROADMAP.json";
const DEFAULT_OUTPUT_PATH = "exports/foundation.project-board.owner-export.v1.json";
const BOARD_ID = "discordos:project-feedback:foundation";
const COMPLETED_STATUSES = new Set(["complete"]);
const STATUS_MAPPING = new Map([
  ["in-progress", { recordStatus: "active", lifecycle: "in-progress" }],
  ["planned", { recordStatus: "active", lifecycle: "planning" }],
  ["planned-later", { recordStatus: "candidate", lifecycle: "intake" }],
  ["blocked", { recordStatus: "active", lifecycle: "blocked" }],
  ["candidate", { recordStatus: "candidate", lifecycle: "intake" }]
]);
const CARD_TYPES = new Set([
  "feature", "bug", "governance", "architecture", "documentation",
  "automation", "research", "migration", "reliability", "technical-debt"
]);

const uniqueSorted = (values) => [...new Set(values)].sort((left, right) => left.localeCompare(right));

const normalizeTimestamp = (value) => {
  if (typeof value !== "string" || value.trim() === "") throw new Error("roadmap.updatedAt is required");
  const candidate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) throw new Error("roadmap.updatedAt must be an ISO date or date-time");
  return parsed.toISOString();
};

const requireStringArray = (item, field, { allowEmpty = true } = {}) => {
  if (!Array.isArray(item[field]) || item[field].some((value) => typeof value !== "string" || value.trim() === "")) {
    throw new Error(`${item.id ?? "<unknown>"}.${field} must be an array of non-empty strings`);
  }
  if (!allowEmpty && item[field].length === 0) throw new Error(`${item.id}.${field} must not be empty`);
  return item[field];
};

const atlasPath = (value) => `repos/foundation/${value.replaceAll("\\", "/")}`;

const mapItem = (item, generatedAt) => {
  const mapping = STATUS_MAPPING.get(item.status);
  if (!mapping) throw new Error(`unsupported non-complete roadmap status for ${item.id}: ${JSON.stringify(item.status)}`);
  if (typeof item.id !== "string" || !/^FDN-[A-Z0-9-]+$/.test(item.id)) throw new Error("work item id must use the FDN-* format");
  if (typeof item.title !== "string" || item.title.trim() === "") throw new Error(`${item.id}.title is required`);
  if (typeof item.goal !== "string" || item.goal.trim() === "") throw new Error(`${item.id}.goal is required`);
  if (!CARD_TYPES.has(item.type)) throw new Error(`${item.id}.type is not a supported card type`);
  if (item.priority !== null) throw new Error(`${item.id}.priority must remain null until owner prioritization is explicit`);
  const dependencies = uniqueSorted(requireStringArray(item, "dependencies"));
  const acceptanceCriteria = requireStringArray(item, "acceptanceCriteria", { allowEmpty: false });
  const evidence = uniqueSorted(requireStringArray(item, "evidence").map(atlasPath));
  const sourceRef = `${ATLAS_ROADMAP_PATH}#${item.id}`;
  const normalizedId = item.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    idempotency_key: `pbk_foundation_${normalizedId}_v1`,
    record_kind: "project-work",
    record_status: mapping.recordStatus,
    record: {
      contract_version: "atlas.card-record.v2",
      card_id: item.id,
      project_id: "foundation",
      board_id: BOARD_ID,
      title: item.title,
      description: item.goal,
      card_type: item.type,
      lifecycle: mapping.lifecycle,
      priority: null,
      owner: "foundation",
      dependencies,
      board_version: 1,
      updated_at: generatedAt,
      source_ref: sourceRef,
      extensions: { roadmap_status: item.status, roadmap_schema_version: 1 }
    },
    source: {
      source_id: "foundation-roadmap",
      source_ref: sourceRef,
      source_status: "current",
      source_updated_at: generatedAt
    },
    content: {
      summary: item.goal,
      objective: item.goal,
      acceptance_criteria: acceptanceCriteria,
      discoveries: [],
      next_actions: [],
      blockers: item.status === "blocked" ? dependencies.map((dependency) => `Blocked by ${dependency}.`) : [],
      evidence
    },
    relationships: { parent_card_id: null, duplicate_of: null, superseded_by: null }
  };
};

export function buildProjectBoardOwnerExport(roadmap, roadmapBytes) {
  if (!roadmap || typeof roadmap !== "object" || Array.isArray(roadmap)) throw new Error("roadmap must be an object");
  if (roadmap.schemaVersion !== 1 || roadmap.projectId !== "foundation") throw new Error("unexpected Foundation roadmap identity");
  if (!Array.isArray(roadmap.workItems) || roadmap.workItems.length === 0) throw new Error("roadmap.workItems must not be empty");
  const ids = roadmap.workItems.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("roadmap work item ids must be unique");

  const generatedAt = normalizeTimestamp(roadmap.updatedAt);
  const canonicalRoadmapBytes = Buffer.from(roadmapBytes).toString("utf8").replace(/\r\n?/g, "\n");
  const digest = crypto.createHash("sha256").update(canonicalRoadmapBytes, "utf8").digest("hex");
  const sourceRevision = `sha256:${digest}`;
  const cards = roadmap.workItems
    .filter((item) => !COMPLETED_STATUSES.has(item.status))
    .map((item) => mapItem(item, generatedAt))
    .sort((left, right) => left.record.card_id.localeCompare(right.record.card_id));

  return {
    contract_version: "atlas.project-board.owner-export.v1",
    export_id: `pbe_foundation_roadmap_${digest.slice(0, 12)}`,
    project_id: "foundation",
    board_id: BOARD_ID,
    owner: "foundation",
    adapter_id: "foundation-roadmap-v1",
    source_revision: sourceRevision,
    generated_at: generatedAt,
    sources: [{
      source_id: "foundation-roadmap",
      kind: "json",
      repository: "foundation",
      path: ATLAS_ROADMAP_PATH,
      revision: sourceRevision,
      observed_at: generatedAt
    }],
    cards,
    extensions: {
      source_digest: sourceRevision,
      source_work_item_count: roadmap.workItems.length,
      exported_card_count: cards.length,
      excluded_completed_statuses: [...COMPLETED_STATUSES].sort(),
      discord_mutation_authorized: false
    }
  };
}

export function renderProjectBoardOwnerExport(repoRoot) {
  const roadmapBytes = fs.readFileSync(path.join(repoRoot, ROADMAP_PATH));
  const roadmap = JSON.parse(roadmapBytes.toString("utf8"));
  return `${JSON.stringify(buildProjectBoardOwnerExport(roadmap, roadmapBytes), null, 2)}\n`;
}

function parseArguments(argv) {
  const options = { check: false, output: DEFAULT_OUTPUT_PATH };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") options.check = true;
    else if (argument === "--out") {
      if (!argv[index + 1]) throw new Error("--out requires a path");
      options.output = argv[index + 1];
      index += 1;
    } else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

export function runProjectBoardOwnerExport(argv, repoRoot = process.cwd()) {
  const options = parseArguments(argv);
  const rendered = renderProjectBoardOwnerExport(repoRoot);
  const outputPath = path.resolve(repoRoot, options.output);
  if (options.check) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== rendered) {
      throw new Error(`${path.relative(repoRoot, outputPath)} is stale; run pnpm board:export`);
    }
    process.stdout.write(`foundation-project-board-owner-export: ok (${JSON.parse(rendered).cards.length} cards)\n`);
    return;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, rendered, "utf8");
  process.stdout.write(`foundation-project-board-owner-export: wrote ${path.relative(repoRoot, outputPath)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    runProjectBoardOwnerExport(process.argv.slice(2));
  } catch (error) {
    console.error(`foundation-project-board-owner-export: ${error.message}`);
    process.exitCode = 1;
  }
}
