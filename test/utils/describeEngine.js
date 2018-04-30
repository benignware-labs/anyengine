const path = require('path');
const { sync: glob } = require('glob');

module.exports = function describeEngine(fn) {
  return glob('fixtures/engines/*/', {
    cwd: path.join(__dirname, '..'),
    absolute: true
  })
    .map(dir => ({
      name: path.basename(dir),
      ext: path.extname(glob('*.*', {
        cwd: dir
      }).shift()).replace(/^\./, '')
    }))
    .map(engine => describe(`with runtime '${engine.name}'`, function() {
      fn.call(this, engine);
    }));
};
