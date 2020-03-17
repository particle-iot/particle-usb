module.exports = {
	extends: ['eslint-config-particle'],
	parserOptions: {
		ecmaVersion: 8,
		sourceType: 'module',
		ecmaFeatures: {
			modules: true
		}
	},
	env: {
		browser: true,
		commonjs: true,
		es6: true,
		node: true,
		mocha: true,
		worker: true,
		serviceworker: true
	}
};
