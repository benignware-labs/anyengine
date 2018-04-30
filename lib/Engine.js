const path = require('path');
const { promisify } = require('util');
const merge = require('deepmerge');
const { readFile, readFileSync } = require('fs');
const readFileAsync = promisify(readFile);
const glob = require('./utils/glob');
const objectPath = require('object-path');

const RuntimeProxy = require('./RuntimeProxy');
const resolveRuntime = require('./resolveRuntime');

const _options = Symbol('options');

const getModule = module => {
  if (typeof module === 'string') {
    module = require(module);
  }
  return module;
};

const normalizeDir = dir => {
  const d = dir.replace(/\/+$/, '') + '/';
  return d;
};

const normalizeOptions = ({
  runtime = null,
  use = [],
  filename,
  basedir = process.cwd(),
  data = {},
  ...options
} = {}) => {

  basedir = normalizeDir(
    path.resolve(
      path.relative(process.cwd(), filename ? path.dirname(path.relative(process.cwd(), filename)) : basedir)
    )
  );

  data = (data => {
    let dataDir;

    switch (typeof data) {
      case 'object':
        return data;
      case 'string':
        dataDir = path.resolve(basedir, data);

        return glob('**/*.json', {
          ignore: ['node_modules/**/*.*'],
          cwd: dataDir
        }).reduce((acc, file) => {
          const src = path.resolve(dataDir, file);
          const relative = path.relative(dataDir, src);
          const json = readFileSync(src, 'utf-8');

          let name = relative.replace(/\..+$/, '').replace(/\//g, '.');
          if (/index$/.test(name)) {
            name = '';
          }

          try {
            let data = JSON.parse(json);
            if (name) {
              let obj = {};
              objectPath.set(obj, name, data);
              return merge(acc, obj);
            } else {
              return merge(acc, data);
            }
          } catch(e) {
            // JSON could not be parsed
          }
        }, {});
    }
  })(data);

  if (!runtime) {
    runtime = resolveRuntime(filename);
  }

  if (runtime) {
    runtime = getModule(runtime);
  }

  use = [...new Set(use)].map(middleware => getModule(middleware));

  return {
    ...options,
    use,
    runtime,
    basedir,
    filename,
    data
  };
};

const Engine = new Proxy(class Engine {
  static use(middleware) {
    this[_options] = this[_options] || {};
    this[_options].use = this[_options].use || {};
    this[_options].use.push(middleware);
  }

  static configure(options = {}) {
    this[_options] = options;
  }

  static compile(source, options = {}) {
    options = Object.assign({}, this[_options], options);
    options = normalizeOptions(options);
    let data = { ...options.data };

    for (let middleware of options.use) {
      const result = middleware(source);
      source = result.content;
      data = merge(data, { ...result.data });
    }

    const compiled = RuntimeProxy(options.runtime).compile(source, options);

    return ((template, data = {}) => (locals = {}) => {
      return template(merge(locals, data));
    })(compiled, data);
  }

  static compileFile(file, options, callback) {
    const promise = readFileAsync(file, 'utf-8')
      .then(source => {
        return this.compile(source, { filename: file, ...options });
      })
      .then(template => {
        if (callback) {
          callback(null, template);
        }
        return template;
      })
      .catch(error => {
        if (callback) {
          callback(error, null);
        }
      });
    if (!callback) {
      return promise;
    }
  }

  static render(source, locals, options) {
    return this.compile(source, options)(locals);
  }

  static renderFile(file, locals, options, callback) {
    const promise = this.compileFile(file, options)
      .then(template => template(locals))
      .then(string => {
        if (callback) {
          callback(null, string);
        }
        return string;
      })
      .catch(error => {
        if (callback) {
          callback(error, null);
        }
      });
    if (!callback) {
      return promise;
    }
  }
}, {
  apply: function(target, thisArg, argumentsList) {
    return target.render.apply(target, argumentsList);
  }
});

module.exports = Engine;
