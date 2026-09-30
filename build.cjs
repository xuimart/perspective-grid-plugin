const esbuild = require('esbuild');
esbuild.buildSync({
  entryPoints: [require('node:path').join(__dirname, 'reference-scene.js')],
  outfile: require('node:path').join(__dirname, 'reference-scene.bundle.js'),
  bundle: true, format: 'iife', globalName: 'PerspectiveReference',
  minify: true, legalComments: 'eof', target: 'es2020'
});
