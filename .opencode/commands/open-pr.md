Search GitHub issues relevant to the current changes to reference or close with this PR.

If on the default branch, create a new branch. Use a conventional commit prefix (feat, fix, refactor, ci, chore, docs) followed by a concise kebab-case description. Examples: feat/add-stripe-webhooks, fix/null-user-lookup, refactor/email-provider.

Push the branch to origin, then open a pull request using:

  gh pr create --fill-verbose --label "needs review"

Use `--fill-verbose` to auto-populate the title and body from commit messages. If the PR should close an issue, ensure the body includes "Closes #<issue>" or "Fixes #<issue>".

After the PR is created, print the PR URL.
