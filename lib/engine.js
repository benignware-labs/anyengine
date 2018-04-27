const path = require('path');
const { promisify } = require('util');
const merge = require('deepmerge');
const { readFile, readFileSync } = require('fs');
const readFileAsync = promisify(readFile);
const glob = require('./utils/glob');
const objectPath = require('object-path');

const EngineProxy = require('./engine-proxy');

const _engine = Symbol('engine');
const _engineProxy = Symbol('engineProxy');
const _options = Symbol('options');

const _middleware = Symbol('middleware');

const resolveRuntime = runtime => {
  if (typeof runtime === 'string') {
    runtime = require(runtime);
  }
  return runtime;
};

const getData = dataDir => {

};

const normalizeDir = dir => {
  const d = dir.replace(/\/+$/, '') + '/';
  return d;
}

const mergeOptions = (...options) => {
  return options.reduce((acc, props = {}) => merge(acc, props), {});
};

const normalizeOptions = ({
  basedir = process.cwd(),
  data = {},
  ...options
} = {}) => {

  basedir = normalizeDir(
    path.resolve(
      path.relative(process.cwd(), options.filename ? path.dirname(path.relative(process.cwd(), options.filename)) : basedir)
    )
  );

  data = (data => {
    switch (typeof data) {
      case 'object':
        return data;
      case 'string':
        const dataDir = path.resolve(basedir, data);

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

  return {
    ...options,
    basedir,
    data
  };
};

const Engine = new Proxy(class Engine {
  static set runtime(runtime) {
    this[_engine] = resolveRuntime(runtime);
    this[_engineProxy] = EngineProxy(this[_engine]);
  }

  static get runtime() {
    return this[_engine];
  }

  static use(middleware) {
    const plugins = this[_middleware] || [];
    plugins.push(middleware);

    this[_middleware] = [...new Set(plugins)];
  }

  static configure(options = {}) {
    this[_options] = options;
  }

  static compile(source, options = {}) {
    options = mergeOptions(this[_options], options);
    options = normalizeOptions(options);
    let data = { ...options.data };

    if (this[_middleware]) {
      for (let middleware of this[_middleware]) {
        if (typeof middleware === 'string') {
          middleware = require(middleware);
        }
        const result = middleware(source);
        source = result.content;
        data = merge(data, { ...result.data });
      }
    }

    const compiled = Engine[_engineProxy].compile(source, options);

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
      })
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
})

module.exports = Engine;
