const path = require('path');
const { sync: glob } = require('glob');

module.exports = function describeSpecs(specs = [], fn) {
  return specs.map(spec => describe(`with spec '${spec}'`, function() {
    fn.call(this, spec);
  }));
};
