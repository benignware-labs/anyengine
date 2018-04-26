const path = require('path');
const { readFileSync, existsSync } = require('fs');
const assert = require('assert');
const frontmatter = require('frontmatter');

const Engine = require('..');

const engines = [
  { engine: 'handlebars', ext: 'hbs' },
  { engine: 'ejs', ext: 'ejs' },
  { engine: 'pug', ext: 'pug' },
  { engine: 'mustache', ext: 'mustache' }, // mst?
  { engine: 'nunjucks', ext: 'njk' }
];

const specs = [
  'basic',
  'advanced',
  'middleware'
];

describe('Engine', () => {
  specs.forEach(spec => {
    describe(`with ${spec} specs`, () => {
      engines.forEach(({ engine, ext }) => {
        const filename = `fixtures/${spec}.${ext}`;

        if (!existsSync(filename)) {
          return;
        }

        describe(`using ${engine}`, () => {
          let locals;
          let expected;

          beforeEach(() => {
            Engine.runtime = engine;
            // Engine.configure({
            //   basedir: path.join(__dirname, 'fixtures')
            // });

            if (spec === 'middleware') {
              Engine.use('frontmatter');
            }

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
            const actual = Engine.render(template, locals, { filename });

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
  });
});
