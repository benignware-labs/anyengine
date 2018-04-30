const path = require('path');
const { readFileSync, existsSync } = require('fs');
const assert = require('assert');
const frontmatter = require('frontmatter');

const Engine = require('..');
const { describeSpecs, describeEngine } = require('./utils');

describe('Engine', () => {
  describeEngine(({ name, ext }) => {
    describeSpecs([
      'basic',
      'advanced',
      'middleware'
    ], spec => {
      const filename = `fixtures/engines/${name}/${spec}.${ext}`;

      let options;
      let locals;
      let expected;

      if (!existsSync(filename)) {
        return;
      }

      beforeEach(() => {
        Engine.configure({
          data: path.join(__dirname, 'fixtures', 'data'),
          use: spec === 'middleware' ? [ 'frontmatter' ] : []
        });

        locals = {
          title: 'Foo'
        };

        expected = readFileSync(`expected/${spec}.html`, 'utf-8').trim();
      })

      it('compiles template', () => {
        const template = readFileSync(filename, 'utf-8');
        const actual = Engine.compile(template, { filename });

        assert.equal(actual(locals), expected);
      });

      it('compiles template file', (done) => {
        Engine.compileFile(filename).then(template => {
          assert.equal(template(locals), expected);
          done();
        });
      });

      it('renders template', () => {
        const template = readFileSync(filename, 'utf-8');
        const actual = Engine(template, { title: 'Foo' }, { filename } );

        assert.equal(actual, expected);
      });

      it('renders template file', (done) => {
        Engine.renderFile(filename, locals).then(actual => {
          assert.equal(actual, expected);
          done();
        });
      });
    });
  });
});
