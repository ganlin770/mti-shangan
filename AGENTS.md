# Repository Working Rules

## Working Mode

- Work non-interactively by default.
- Gather context, reproduce the issue when applicable, implement, test, and refine in the same run.
- Do not stop for intermediate confirmation unless a missing credential, destructive out-of-scope action, or irreducible product decision blocks progress.

## Verification

1. Reproduce or identify the failure condition.
2. Make the smallest defensible change.
3. Run focused checks first, then the applicable broader checks.
4. Keep unrelated refactors out of the same change.

## Git Publication

- This repository has standing publication authorization whenever the current task explicitly includes `推送`, `改完推送`, `直接推送`, `提交并推送`, `push`, or equivalent wording.
- For an authorized task, finish the implementation and checks, stage only the task's files, commit, and immediately publish the currently checked-out branch without asking for confirmation again. Do not stop after creating a local commit.
- Normal fast-forward publication through authenticated `git`, GitHub CLI, or the GitHub API is allowed; if one publication route is unavailable, use another authenticated route when safe.
- Tasks that do not contain an explicit publication request remain local unless the user later authorizes publication.
- After an authorized push, verify the local branch, remote branch, and deployment state separately when deployment is applicable.
- Never force-push, merge branches, delete branches or tags, or rewrite published history unless the user explicitly authorizes that exact operation.

## Safety

- Never modify files outside the approved workspace roots.
- Never add production dependencies unless the task explicitly requires them.
- Preserve unrelated user changes in a dirty worktree.
