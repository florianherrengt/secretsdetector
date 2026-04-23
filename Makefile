.PHONY: parallel-create parallel-start parallel-status parallel-stop parallel-remove

parallel-create:
	@node scripts/parallel-env.mjs create "$(BRANCH)"

parallel-start:
	@node scripts/parallel-env.mjs start "$(BRANCH)"

parallel-status:
	@node scripts/parallel-env.mjs status "$(BRANCH)"

parallel-stop:
	@node scripts/parallel-env.mjs stop "$(BRANCH)"

parallel-remove:
	@node scripts/parallel-env.mjs remove "$(BRANCH)"
