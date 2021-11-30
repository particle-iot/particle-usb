# Releasing a new version

Packages are only released from the `main` branch after peer review.

1. make sure you have the latest:
	* `$ git checkout main`
	* `$ git pull`
2. make sure tests pass
	* `$ npm test`
3. bump the version
	* `$ npm version <major|minor|patch>`
4. push your tags:
	* `$ git push origin main --follow-tags`

_CI will publish to npm when the build succeeds_
