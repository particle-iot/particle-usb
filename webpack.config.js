const path = require('path');
const webpack = require('webpack');


module.exports = {
	mode: 'development',
	entry: './src/particle-usb.js',
	output: {
		path: path.resolve(__dirname, 'dist'),
		filename: 'particle-usb.bundle.js',
		library: 'ParticleUsb',
		libraryTarget: 'umd',
		umdNamedDefine: true
	},
	resolve: {
		fallback: {
			buffer: require.resolve('buffer/'),
			zlib: false,
			util: false,
			stream: false,
			path: false,
			os: false,
			crypto: false,
			constants:false,
			assert:false,
			fs: false
		}
	},
	plugins: [
		new webpack.ProvidePlugin({
			Buffer: ['buffer', 'Buffer'],
		})
	]
};

