const { sync: glob } = require('glob');

// TODO: Build cache layer
module.exports = (...args) => {
  return glob(...args);
};
