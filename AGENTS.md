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

- Do not push by default.
- When the user explicitly says `推送`, `改完推送`, `push`, or otherwise clearly requests publication in the current task, that is authorization to commit and push the task's verified changes to the currently checked-out branch without asking again.
- After an authorized push, verify the local branch, remote branch, and deployment state separately when deployment is applicable.
- Never force-push, merge branches, delete branches or tags, or rewrite published history unless the user explicitly authorizes that exact operation.

## Safety

- Never modify files outside the approved workspace roots.
- Never add production dependencies unless the task explicitly requires them.
- Preserve unrelated user changes in a dirty worktree.
