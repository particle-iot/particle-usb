const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/particle-usb.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'particle-usb.bundle.js',
    library: 'ParticleUsb',
    libraryTarget: 'var'
  }
};
