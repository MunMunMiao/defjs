export const meta = {
  name: 'documentation-alignment-hard-switch',
  description: 'Synchronize all documentation with current feat/up codebase using focused subagent workers',
  phases: [
    { title: 'Setup and design docs cleanup' },
    { title: 'Internal docs rewrite' },
    { title: 'User docs sync' },
    { title: 'Multilang and validation' },
    { title: 'Final review' },
  ],
}

const REPO = '/Users/munmunmiao/Documents/web/zen-kit'
const BRIEF_DIR = `${REPO}/.sdd-briefs`
const PLAN = `${REPO}/docs/superpowers/plans/2026-06-29-documentation-alignment-hard-switch-implementation.md`

const GLOBAL_CONSTRAINTS = `
- Hard switch only: no compatibility notes, no migration guides, no "old vs new" comparisons.
- Code is the source of truth: when docs conflict with current code or accepted specs, update the docs.
- Single source of truth per rule: design decisions live in specs; implementation boundaries live in internal docs; usage examples live in user docs.
- Runnable examples: every TypeScript snippet in user docs must type-check against current public API.
- Multi-language tiering: English is canonical; zh-Hans follows English; other locales get minimal stale-content removal only.
- No code changes: modify documentation only.
`

function workerPrompt(role, taskNumbers, reportFile) {
  const briefs = taskNumbers.map(n => `${BRIEF_DIR}/task-${n}-brief.md`).join('\n')
  return `You are a documentation worker implementing: ${role}

Read these task briefs IN ORDER; each brief contains the exact steps, code, and commands for one task:
${briefs}

Plan file for cross-reference: ${PLAN}

Global constraints (apply to every task):
${GLOBAL_CONSTRAINTS}

Work from: ${REPO}

Instructions:
1. Execute the tasks in the order listed above. Do not skip steps.
2. For each task, implement exactly what the brief specifies, run the specified verification commands, and commit.
3. If a brief's example code does not type-check against current @defjs/core public API, adjust the example to match the actual API and note the discrepancy in your report.
4. If you encounter unclear requirements or blockers, report BLOCKED or NEEDS_CONTEXT with specifics; do not guess.
5. After each commit, record the short SHA and subject in your report.
6. Perform a brief self-review before finishing: scan your changes for TBD/TODO placeholders, stale API references, and broken Markdown.

Write your full report to: ${reportFile}
The report must include:
- What you implemented per task
- Verification commands run and their outcomes
- Files changed and commits created (SHA + subject)
- Any issues, concerns, or deviations from the brief

Return ONLY:
- Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Commits created (short SHA + subject)
- One-line verification summary
- Concerns, if any
- Report file path
`
}

phase('Setup and design docs cleanup')
const worker1Report = `${REPO}/.sdd-briefs/worker-1-report.md`
const worker1 = await agent(workerPrompt(
  'Tasks 1-2: create doc stale-API scan script, run baseline scan, and clean superpowers design docs',
  [1, 2],
  worker1Report
), { label: 'worker-1: setup + superpowers', phase: 'Setup and design docs cleanup' })

if (worker1?.status?.startsWith('BLOCKED') || worker1?.status?.startsWith('NEEDS_CONTEXT')) {
  log(`Worker 1 blocked: ${worker1.status}. Stopping workflow.`)
  throw new Error(worker1.status)
}

phase('Internal docs rewrite')
const worker2Report = `${REPO}/.sdd-briefs/worker-2-report.md`
const worker2 = await agent(workerPrompt(
  'Tasks 3-4: rewrite packages/core/README.md and update packages/core/design.md',
  [3, 4],
  worker2Report
), { label: 'worker-2: internal docs', phase: 'Internal docs rewrite' })

if (worker2?.status?.startsWith('BLOCKED') || worker2?.status?.startsWith('NEEDS_CONTEXT')) {
  log(`Worker 2 blocked: ${worker2.status}. Stopping workflow.`)
  throw new Error(worker2.status)
}

phase('User docs sync')
const worker3Report = `${REPO}/.sdd-briefs/worker-3-report.md`
const worker3 = await agent(workerPrompt(
  'Tasks 5-9: review struct.md, rewrite commands.md, fix sse.md, sync other core docs, sync guide docs',
  [5, 6, 7, 8, 9],
  worker3Report
), { label: 'worker-3: user docs', phase: 'User docs sync' })

if (worker3?.status?.startsWith('BLOCKED') || worker3?.status?.startsWith('NEEDS_CONTEXT')) {
  log(`Worker 3 blocked: ${worker3.status}. Stopping workflow.`)
  throw new Error(worker3.status)
}

phase('Multilang and validation')
const worker4Report = `${REPO}/.sdd-briefs/worker-4-report.md`
const worker4 = await agent(workerPrompt(
  'Tasks 10-12: sync zh-Hans, clean other locales, run VitePress build, run final stale-API scan and typecheck',
  [10, 11, 12],
  worker4Report
), { label: 'worker-4: multilang + validation', phase: 'Multilang and validation' })

if (worker4?.status?.startsWith('BLOCKED') || worker4?.status?.startsWith('NEEDS_CONTEXT')) {
  log(`Worker 4 blocked: ${worker4.status}. Stopping workflow.`)
  throw new Error(worker4.status)
}

phase('Final review')
const finalReviewReport = `${REPO}/.sdd-briefs/final-review-report.md`
const finalReview = await agent(`You are performing a final whole-branch documentation review.

Repository: ${REPO}
Plan: ${PLAN}

Read the reports from each worker to understand what changed:
- ${worker1Report}
- ${worker2Report}
- ${worker3Report}
- ${worker4Report}

Then run these commands to see the full diff:
\`\`\`bash
cd ${REPO}
git log --oneline -20
git diff --stat
git diff -U5
\`\`\`

Review the documentation changes against these global constraints:
${GLOBAL_CONSTRAINTS}

Focus on:
1. No stale API references (Schema, tag.*, requireTag, @mobily/ts-belt) in production docs.
2. Examples use @defjs/core struct API and current build(ctx, input) patterns.
3. English docs are internally consistent; zh-Hans follows English; other locales at least removed stale content.
4. No TBD/TODO placeholders except intentional locale TODO comments.
5. VitePress build succeeded and final scan/typecheck passed (verify from worker reports).

Write your report to: ${finalReviewReport}

Return:
- Status: APPROVED | NEEDS_FIXES
- Summary of findings (Critical/Important/Minor)
- Recommended next action
- Report file path
`, { label: 'final-review', phase: 'Final review', model: 'sonnet' })

return {
  worker1,
  worker2,
  worker3,
  worker4,
  finalReview,
}
