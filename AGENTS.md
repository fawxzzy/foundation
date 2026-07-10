# AGENTS.md — Fawxzzy Foundation

## Mission

Operate Foundation as the root coordination repo for the Fawxzzy project family. Prefer deterministic registry updates, generated docs, and local verification over broad inference.

## Source of truth

Use these files first:

1. `foundation.config.json`
2. `data/projects.json`
3. `packages/contracts/foundation.schema.json`
4. `.playbook/ai-contract.json`
5. `docs/architecture/FOUNDATION_BLUEPRINT.md`

## Required workflow

After changing project registry, console, docs generation, or contracts:

```bash
pnpm build
pnpm verify:local
```

For quick inspection:

```bash
pnpm foundation status
pnpm foundation projects --json
```

## Mutation rules

- Do not hand-edit `docs/architecture/PROJECT_REGISTRY.md` unless the generator is also updated. Prefer `data/projects.json -> pnpm build`.
- Keep runtime outputs under `.foundation/`; do not promote generated receipts into git without an explicit reason.
- Keep human docs brief-thin. Put machine-heavy facts in JSON contracts.
- Do not add external dependencies unless the need is clear and the verification path remains simple.
- Use `AGENTS.md` as the canonical agent contract name across new repos.
- Treat every Vercel production deploy, promotion, rollback/promotion, or production-alias cutover as approval-gated.
- Do not run any production-targeting Vercel mutation for Foundation unless the operator explicitly says so in the current thread with wording such as `deploy to prod`, `deploy to production`, or `promote Foundation on Vercel`.
- Generic approval such as `continue`, `proceed`, `do it`, or broad batch approval does not count as Vercel production deploy approval.

## Preferred shape

Foundation should remain a modular monorepo:

- `packages/cli` for operator commands.
- `packages/contracts` for schemas and machine-readable contracts.
- `packages/core` for shared registry/domain logic.
- `apps/console` for the operator dashboard.
- `docs/operations` for handoff instructions.

## Current bootstrap constraints

The initial CLI and verification scripts are dependency-free so the repo can prove itself before package installation, hosting, or Playbook adoption.
