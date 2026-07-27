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

- This repository has standing publication authorization for every task that asks to modify, fix, optimize, implement, add, remove, or otherwise change repository files. The user does not need to repeat `推送` or approve publication again.
- After completing a requested change and passing the applicable checks, stage only that task's files, create an intentional commit, and immediately fast-forward push the currently checked-out branch. Do not stop at uncommitted changes or a local-only commit.
- Keep a task local only when the user explicitly says `不要推送`, `仅本地修改`, `只给方案`, or equivalent wording, or when the request is read-only and does not authorize repository changes.
- Follow the user's requested scope exactly. Do not include unrelated files or broaden the requested change merely because publication is automatic.
- If implementation or verification fails, repair it and rerun the checks before publication. If publication remains blocked, exhaust safe authenticated routes and report the exact blocker; never claim that a push succeeded before verifying the remote branch.
- Normal fast-forward publication through authenticated `git`, GitHub CLI, or the GitHub API is allowed; if one publication route is unavailable, use another authenticated route when safe.
- After every push, verify the local branch, remote branch, and deployment state separately when deployment is applicable.
- Force-push, branch merges, branch/tag deletion, and published-history rewrites are high-risk operations, but they are allowed when the user explicitly names the exact operation and target in the current task. Treat broad standing publication authorization as covering normal fast-forward publication only.

## Safety

- Never modify files outside the approved workspace roots.
- Never add production dependencies unless the task explicitly requires them.
- Preserve unrelated user changes in a dirty worktree.
