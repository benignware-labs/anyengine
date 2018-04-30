const { readFileSync } = require('fs');
const parseFunction = require('parse-function');
const pretty = require('pretty');
const path = require('path');
const glob = require('./utils/glob');
const { sync: isBinaryFile } = require('isbinaryfile');
const extName = require('ext-name');

const TEMPLATES_PATH_PATTERN = /(templates|views)/;
const OPTIONS_PATTERN = /(options|opts)/;
const CALLBACK_PATTERN = /(callback|cb)/;
const PARTIALS_PATTERN = /partials/;

const _configure = Symbol('configure');

const { parse: parseFn } = parseFunction({
  ecmaVersion: 2017
});

const prettify = html => {
  return pretty(html, {
    ocd: true
  });
};

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

      if (key === _configure) {
        return function(options) {
          const { basedir, ...opts } = options;
          if (target['configure']) {
            const { args: params } = parseFn(target['configure']);
            const basedirParamIndex = params.findIndex(param => TEMPLATES_PATH_PATTERN.test(param));
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

        if (key === 'compile') {
          return function(template, options) {
            return locals => this.render(template, locals, options);
          };
        }

        if (key === 'render') {
          return function(template, locals, options) {
            if (typeof target['compile'] === 'function') {
              return this.compile(template, options)(locals);
            }
          };
        }

        // throw new Error(`'${key}' is not implemented`);

      } else {

        if (key === 'compile' || key === 'render') {

          return function(...args) {
            let result;
            let source = args[0];
            let options = key === 'render' ? args[2] : args[1];
            let optionsParamIndex = params.findIndex(param => OPTIONS_PATTERN.test(param));
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
              // Mustache takes partials as param to the compile method
              engineArgs[partialsParamIndex] = getPartials(options.basedir);
            }

            try {
              this[_configure](options);
              result = handle.apply(target, engineArgs);
              if (key === 'compile') {
                return ((res, options) => {
                  let fn;
                  if (typeof res === 'function') {
                    fn = locals => prettify(res(locals));
                  } else if (typeof res === 'object' && typeof res.render === 'function') {
                    fn = locals => {
                      const { args: params } = parseFn(res.render);
                      const partialsParamIndex = params.findIndex(param => PARTIALS_PATTERN.test(param));
                      const engineArgs = [ locals ];

                      // Hogan wants partials passed to template render method
                      if (partialsParamIndex >= 0) {
                        engineArgs[partialsParamIndex] = getPartials(options.basedir);
                      }

                      const str = res.render.apply(res, engineArgs);

                      if (str === null) {
                        return this.render(source, locals, options);
                      }
                      return prettify(str);
                    };
                  }
                  return fn;
                })(result, options);
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
          };
        }
      }

      return Reflect.get(target, key, receiver);
    }
  });
}

module.exports = EngineProxy;
