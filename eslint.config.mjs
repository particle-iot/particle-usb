import { particle, globals } from 'eslint-config-particle';

export default [
	{
		name: 'Add browser globals for window access',
		languageOptions: {
			globals: {
				...globals.browser,
			}
		}
	},
	...particle({
		rootDir: import.meta.dirname,
		testGlobals: 'mocha'
	})
];
