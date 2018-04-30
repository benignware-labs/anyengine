const path = require('path');
const { readFileSync } = require('fs');
const { sync: glob } = require('glob');
const extName = require('ext-name');
const { get: levenshtein } = require('fast-levenshtein');
const { path: root } = require('app-root-path');

const ENGINE_PATTERN = /template/;
const FILE_PATH = process.env.FILE_PATH || __filename;

const isEngine = module => {
  if (module.compile || module.render) {
    return true;
  }
};

const sum = array => array.reduce((total, value) => total + value, 0);

const avg = array => sum(array) / array.length;

const getPackageScore = ({ description, keywords = [] }) => {
  return sum([
    ENGINE_PATTERN.test(description),
    keywords.filter(keyword => ENGINE_PATTERN.test(keyword)).length
  ]);
};

const getFileScore = ({ name }, filename) => {
  const extname = path.extname(filename).replace(/^\./, '');
  const [ { mime = '', ext = '' } = {} ] = extName(filename);
  const mimename = extname === ext ? mime.replace(/^text\//, '').replace(/^x-/, '').replace(/-template$/, '') : '';
  const terms = Array.from(new Set([ extname, mimename ])).filter(term => term);

  return avg(terms.map(term =>
    name === term ? 1 : name.match(term) ? 0.85 : (name.length - term.length) / levenshtein(term, name)
  ));
};

const getEngines = (() => {
  let engines;
  return () => {
    if (!engines) {
      engines = glob('node_modules/*/package.json', {
        cwd: root,
        absolute: true
      })
        .map(src => JSON.parse(readFileSync(path.resolve(src), 'utf-8')))
        .filter(meta => getPackageScore(meta) > 0 && isEngine(require(meta.name)));
    }
    return engines;
  };
})();

const getEngineByFile = filename =>
  getEngines()
    .slice()
    .sort((a, b) => getFileScore(b, filename) - getFileScore(a, filename))
    .shift();

module.exports = function resolveRuntime(filename = null) {
  let engine;
  if (filename) {
    engine = getEngineByFile(filename);
  }
  if (!engine) {
    return getEngines().shift();
  }

  return engine ? engine.name : null;
};
