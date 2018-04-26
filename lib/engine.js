const { promisify } = require('util');
const merge = require('deepmerge');
const { readFile, readFileSync } = require('fs');
const readFileAsync = promisify(readFile);

const EngineProxy = require('./engine-proxy');

const _engine = Symbol('engine');
const _engineProxy = Symbol('engineProxy');

const _middleware = Symbol('middleware');

const Engine = new Proxy(class Engine {
  static set runtime(engine) {
    this[_engine] = engine;
    this[_engineProxy] = EngineProxy(engine);
  }

  static get runtime() {
    return this[_engine];
  }

  static use(middleware) {
    const plugins = this[_middleware] || [];
    plugins.push(middleware);

    this[_middleware] = [...new Set(plugins)];
  }

  static compile(source, options) {
    let data = {};

    if (this[_middleware]) {
      for (let middleware of this[_middleware]) {
        const result = middleware(source);
        source = result.content;
        data = merge(data, result.data);
      }
    }

    const compiled = Engine[_engineProxy].compile(source, options);

    return ((template, data = {}) => (locals = {}) => template(merge(locals, data)))(compiled, data);
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
  get(target, key, receiver) {
    if (typeof target[key] === 'undefined') {
      return Reflect.get(Engine[_engineProxy], key, receiver);
    }
    return Reflect.get(target, key, receiver);
  }
})

module.exports = Engine;
