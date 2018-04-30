# anyengine

A meta-programming approach to universal templating


## API

##### `Engine.configure([options])`

Specify default options

##### `Engine.compile(template, [options])`

Compiles template string

##### `Engine.compileFile(filename, [options], [callback])`

Compiles template file

##### `Engine.render(template, [locals], [options])`

Renders template string

##### `Engine.renderFile(filename, [locals], [options], [callback])`

Renders template file

### Options

| Name            | Type            | Description
|-----------------|-----------------|------------------------------------------------|
| basedir         | `string`          | Specify basedir. Used to resolve partials and data
| filename        | `string`          | Specify filename when rendering strings. Used to resolve partials and data
| runtime         | <code>string&#124;function&#124;object </code>         | Specify engine runtime. If not specified, it is resolved by file extension
| use             | `array`           | Specify middleware
