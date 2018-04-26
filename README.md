# anygine

A meta-programming approach to universal templating


## API

#### compile(template, options)

Compiles template string

#### compileFile(filename, options, [callback])

Compiles template file

#### render(template, locals, options)

Renders template string

#### renderFile(filename, locals, options, [callback])

Renders template file

#### use(middleware)

Applies middleware during compilation
