const path = require('path');
const assert = require('assert');

const describeEngine = require('./utils/describeEngine');
const resolveRuntime = require('../lib/resolveRuntime');

describe('resolveRuntime', () => {
  describeEngine(({ name, ext }) => {
    it('resolves runtime by file extension', () => {
      const actual = resolveRuntime(`file.${ext}`);
      assert.equal(actual, name);
    });
  });
});
