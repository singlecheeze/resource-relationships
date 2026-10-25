const path = require('path');
const Copy = require('copy-webpack-plugin');
module.exports = {
  mode: 'development', entry: './preview/index.tsx',
  output: { path: path.resolve(__dirname, 'preview-dist'), filename: 'preview.js', publicPath: '/' },
  resolve: { extensions: ['.tsx', '.ts', '.js'], alias: { '@openshift-console/dynamic-plugin-sdk$': path.resolve(__dirname, 'preview/sdk.ts') } },
  module: { rules: [
    { test: /\.tsx?$/, exclude: /node_modules/, use: 'swc-loader' },
    { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    { test: /\.(svg|woff2?|ttf|eot)$/, type: 'asset/resource' },
  ] },
  plugins: [new Copy({ patterns: [{ from: 'preview/index.html', to: 'index.html' }] })],
};
