# Releasing a new version

- Checkout the `master` branch.

- `npm version <major | minor | patch>`

  - This will bump the version in `package.json`, update the reference docs, and make a version commit and a tag for you.

- `git push && git push --tags`

  - Travis will publish to npm when the build succeeds.
