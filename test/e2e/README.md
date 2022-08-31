# Particle USB - End-to-End Tests

This directory contains mocha-driven end-to-end (e2e) tests as well as various fixtures and supporting libraries.


## How to Run

The e2e tests run in two modes: with a device connected, and without. Since the current CI system does not have access to Particle hardware, tests that depend on accessing a device are disabled.


### Running _with_ a device

_NOTE: Your device will be flashed, etc. Test failures may leave it in a bad state. **Please DO NOT use a mission-critical device!**_

1. Disconnect all Particle devices from your computer's USB
2. Connect your test device(s) via USB and wait for it to connect to the cloud (breathe cyan)
3. run `npm run test:e2e`


### Running _without_ a device

1. run `npm run test:e2e:no-device`


## Adding Tests

Test filenames are formatted like: `<environment>.e2e.js` and located within the `./test/e2e` directory.

```
test/e2e
├── __fixtures__  <-- test fixtures (projects, data, etc)
│   ├── node-proj
│   │   └── ...
│   ├── web-proj
│   │   └── ...
│   └── ...
│
├── lib  <-- supporting libraries
│   ├── cli.js
│   ├── env.js
│   ├── fs.js
│   └── ...
│
├── browser.e2e.js <-- e2e tests for browser (Chromium) usage
├── node.e2e.js <-- e2e tests for Node.js usage
├── README.md
└── ...
```


### Naming

`describe()` titles should be title-case, `it()` names should be sentence-case. If applicable, `tags` should be included after the title. `tags` are a comma-delimited set of tokens prefixed with `@` (e.g. `@device`)


For example:

```js
describe('Browser Usage', () => {
	describe('Listing Devices [@device]', () => {
		it('Gets authorized devices', async () => {
			//...
		});
	});
});

```


### Tags

Tags provide an easy way to filter tests using use mocha's `--grep` feature ([docs](https://github.com/mochajs/mocha/wiki/Tagging)). We use the `@device` tag to identify test suites which _require_ a physical Particle hardware device in order to run.


## Known Issues

* Programmatic access to the browser's "Connect" dialog is not yet implemented, follow [chromium#831982](https://bugs.chromium.org/p/chromium/issues/detail?id=831982) for updates

