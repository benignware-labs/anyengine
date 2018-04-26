const { promisify } = require('util');
const { readFile, readFileSync } = require('fs');
const readFileAsync = promisify(readFile);
const parseFunction = require('parse-function');
const pretty = require('pretty');
const path = require('path');
const { sync: glob } = require('glob');
const { sync: isBinaryFile } = require("isbinaryfile");
const extName = require('ext-name');

const TEMPLATES_PATH_PATTERN = /(templates|views)/;
const OPTIONS_PATTERN = /(options|opts)/;
const LOCALS_PATTERN = /(locals|data)/;
const TEMPLATE_PATTERN = /(str)/;
const CALLBACK_PATTERN = /(callback|cb)/;
const PARTIALS_PATTERN = /partials/;

const _options = Symbol('options');
const _configure = Symbol('configure');
const _partials = Symbol('partials');

const { parse: parseFn } = parseFunction({
  ecmaVersion: 2017
});

const prettify = html => {
  return pretty(html, {
    ocd: true
  });
};

const normalizeDir = dir => {
  const d = dir.replace(/\/+$/, '') + '/';
  return d;
}

const normalizeOptions = ({
  basedir = process.cwd(),
  ...options
}) => ({
  ...options,
  basedir: normalizeDir(
    path.resolve(
      path.relative(process.cwd(), options.filename ? path.dirname(path.relative(process.cwd(), options.filename)) : basedir)
    )
  )
});

const getPartials = (dir = process.cwd()) => {
  const result = {};

  // Find any templates contained in basedir
  const files = glob('**/*.*', {
    ignore: ['node_modules/**/*.*'],
    cwd: dir
  });

  for (let file of files) {
    let src = path.resolve(dir, file);
    let [ { mime } = {} ] = extName(src);
    if (/^\s*text/.test(mime) || !isBinaryFile(src)) {
      const name = file;
      const source = readFileSync(src, 'utf-8');
      result[name] = source;
    }
  }

  return result;
};

function EngineProxy(engine) {
  return new Proxy(engine, {
    get(target, key, receiver) {
      const handle = Reflect.get(target, key, receiver);
      const type = typeof target[key];
      const params = type === 'function' ? parseFn(target[key]).args : [];

      if (key === 'configure') {
        return function(options) {
          this[_configure].call(this, options);
        };
      }

      if (key === _configure) {
        return function(options) {
          this[_options] = normalizeOptions(options);
          const { basedir, ...opts } = this[_options];
          if (target['configure']) {
            const { args: params } = parseFn(target['configure']);
            const basedirParamIndex = params.findIndex(param => TEMPLATES_PATH_PATTERN.test(params[0]));
            if (basedirParamIndex >= 0) {
              target['configure'].call(target, basedir, opts);
            }
          }

          if (target['registerPartial']) {
            const partials = getPartials(basedir);
            for (let [ name, source ] of Object.entries(partials)) {
              target['registerPartial'](name, source);
            }
          }
        };
      }

      if (typeof target[key] === 'undefined') {

        if (key === 'compileFile') {
          return function(filename, options = {}, callback) {
            const promise = readFileAsync(filename, 'utf-8')
              .then(data => {
                const func = this.compile(data, options);

                // const func = (result => {
                //   let fn;
                //   if (typeof result === 'function') {
                //     fn = locals => prettify(result(locals));
                //   } else if (typeof result === 'object' && typeof result.render === 'function') {
                //     fn = locals => prettify(result.render.call(result, locals));
                //   }
                //   return fn;
                // })(result);

                if (callback) {
                  callback(null, func);
                } else {
                  return Promise.resolve(func);
                }
              })
              .catch(err => {
                if (callback) {
                  callback(err, null);
                }
              });
            if (!callback) {
              return promise;
            }
          };
        }

        if (key === 'renderFile') {

          return function(filename, locals = {}, options = {}, callback) {
            const promise = readFileAsync(filename, 'utf-8')
              .then(data => {
                const result = this.render(data, locals, {
                  ...options,
                  filename
                });
                if (callback) {
                  callback(null, result);
                } else {
                  return Promise.resolve(result);
                }
              })
              .catch(err => {
                if (callback) {
                  callback(err, null);
                }
              });
            if (!callback) {
              return promise;
            }
          };
        }

        if (key === 'compile') {
          return function(template, options) {
            return locals => this.render(template, locals, options);
          }
        }

        if (key === 'render') {
          return function(template, locals, options) {
            if (typeof target['compile'] === 'function') {
              return this.compile(template, options)(locals);
            }
          }
        }

        // throw new Error(`'${key}' is not implemented`);

      } else {

        // Normalize async methods
        if (key === 'compileFile' || key === 'renderFile') {
          return function(...args) {
            const argsCallback = typeof args[args.length - 1] === 'function' && args.pop();
            const newPromise = new Promise((resolve, reject) => {
              let result;
              const _resolve = key === 'compileFile' ? (template) => {
                resolve((template => (...args) => prettify(template(...args)))(template));
              } : result => resolve(prettify(result));

              if (argsCallback) {
                args = (err, data) => {
                  if (err) {
                    reject(err);
                  } else {
                    _resolve(data);
                  }
                };
              }
              result = handle.apply(this, args);

              if (result) {
                if (result.then) {
                  // Async with promise
                  result.then(result => {
                    _resolve(result);
                  }).catch(err => {
                    reject(err);
                  });
                } else {
                  // Sync
                  _resolve(result);
                }
              }
            });

            if (argsCallback) {
              newPromise.then(result => {
                argsCallback(null, result);
              });
            } else {
              newPromise.then(res => {
                return res;
              });
              return newPromise;
            }
          }
        }

        if (key === 'compile' || key === 'render') {

          return function(...args) {
            let render;
            let result;
            let source = args[0];
            const options = key === 'render' ? args[2] : args[1];
            const settings = Object.assign({}, this[_options], options);
            let optionsParamIndex = params.findIndex(param => OPTIONS_PATTERN.test(param));
            let localsParamIndex = params.findIndex(param => LOCALS_PATTERN.test(param));
            let callbackParamIndex = params.findIndex(param => CALLBACK_PATTERN.test(param));
            let partialsParamIndex = params.findIndex(param => PARTIALS_PATTERN.test(param));

            let engineArgs = [ ...args ];

            // Some engines like pug don't differentiate between locals and options
            if (params.length < 3 && callbackParamIndex === -1 || params.length < 4) {
              engineArgs = [ engineArgs[0], Object.assign({}, engineArgs[1], engineArgs[2]), ...engineArgs.slice(3) ];
            }

            if (key === 'compile' && optionsParamIndex === -1) {
              engineArgs = [ source, ...engineArgs.slice(2) ];
            }

            if (partialsParamIndex >= 0) {
              // engineArgs = args.slice(0, partialsParamIndex - 1).concat(getPartials(settings.basedir)).concat(args.slice(partialsParamIndex + 1));
              // engineArgs = [ source, ...engineArgs ];
              engineArgs[partialsParamIndex] = getPartials(settings.basedir);
            }

            try {
              this[_configure](settings);
              result = handle.apply(target, engineArgs);
              if (key === 'compile') {
                return (res => {
                  let fn;
                  if (typeof res === 'function') {
                    fn = locals => prettify(res(locals));
                  } else if (typeof res === 'object' && typeof res.render === 'function') {
                    fn = locals => {
                      const str = res.render(locals);
                      if (str === null) {
                        return this.render(source, locals);
                      }
                      return prettify(str);
                    };
                  }
                  return fn;
                })(result);
              } else if (typeof result === 'string') {
                return prettify(result);
              }
            } catch(e) {
              if (/not\s+found/.test(e.message)) {
                // Engine expects file, try alternative method `renderString`
                const alternateMethod = target[`${key}String`];
                if (alternateMethod) {
                  let res = alternateMethod.apply(this, engineArgs);
                  res = prettify(res);
                  return res;
                }
              } else {
                throw(e);
              }
            }
          }
        }
      }

      return Reflect.get(target, key, receiver);
    }
  });
}

module.exports = EngineProxy;
