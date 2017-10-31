const ascjs = require('ascjs');
const escape = require('html-escaper').escape;
const parser = require('babylon');
const defaultOptions = {
  sourceType: 'module',
  plugins: [
    'estree',
    'jsx',
    'flow',
    'typescript',
    'doExpressions',
    'objectRestSpread',
    'decorators',
    'decorators2',
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'exportExtensions',
    'asyncGenerators',
    'functionBind',
    'functionSent',
    'dynamicImport',
    'numericSeparator',
    'optionalChaining',
    'importMeta',
    'bigInt',
    'optionalCatchBinding',
    'throwExpressions',
    'pipelineOperator',
    'nullishCoalescingOperator'
  ]
};

const fs = require('fs');
const path = require('path');
const index = fs.readFileSync(path.join(__dirname, 'index.html')).toString();

const parse = (options, base, file, cache, db) => {
  let code = fs.readFileSync(file).toString();
  if (/^(?:import|export)\s+/m.test(code)) code = ascjs(code);
  const parseMore = (module, name) => {
    if (!cache.has(name)) {
      cache.add(name);
      parse(options, path.dirname(name), name, cache, db);
    }
  };
  const findRequire = item => {
    switch (item.type) {
      case 'TaggedTemplateExpression':
        if (item.tag.name === 'i18n') {
          const template = item.quasi.quasis.map(quasi => quasi.value.raw);
          (db[template.join('\x01')] = {})[options.locale] = {
            t: null,
            v: item.quasi.expressions.map((expression, i) => i)
          };
          findRequire(item.quasi);
        }
        break;
      case 'CallExpression':
        switch (item.callee.name) {
          case 'import':
          case 'require':
            const module = item.arguments[0];
            if (/^[./]/.test(module.value)) {
              let name = '';
              try { name = require.resolve(path.resolve(base, module.value)); } catch(o_O) {}
              if (/\.m?js$/.test(name)) parseMore(module, name);
            } else {
              process.chdir(base);
              const name = require.resolve(module.value);
              if (name !== module.value) parseMore(module, name);
            }
            break;
        }
      default:
        for (let key in item) {
          if (typeof item[key] === 'object') {
            findRequire(item[key] || {});
          }
        }
        break;
    }
  };
  const parsed = parser.parse(code, options);
  debugger;
  parsed.program.body.forEach(findRequire);
  return db;
};

module.exports = {
  createDefaultDB: (main, options) => {
    let base = path.dirname(main);
    main = path.resolve(base, main);
    base = path.dirname(main);
    return parse(
      Object.assign(
        {},
        defaultOptions,
        options
      ),
      base,
      main,
      new Set,
      {}
    );
  },
  createTable: (db, locale, existent, translations) => {
    const table = [];
    const keys = Object.keys(db);
    Object.keys(existent).forEach(key => {
      if (keys.indexOf(key) < 0) delete existent[key];
    });
    keys.forEach(key => {
      const out = [];
      const target = db[key];
      const source = {
        t: key.split('\x01'),
        v: target[locale].v
      };
      const sentence = source.t.map((chunk, i) => {
        return (i ? ('${' + (i - 1) + '}') : '') + chunk;
      }).join('');
      translations.forEach(lang => {
        if (!target.hasOwnProperty(lang)) {
          target[lang] = {t: source.t, v: source.v};
          out.push(`<tr><td valign="top">${lang}</td><td valign="top"><textarea>${sentence}</textarea></td></tr>`);
        }
      });
      if (out.length) {
        table.push(`<tr class="native" data-key="${escape(key)}"><td valign="top">${locale}</td><td valign="top"><textarea disabled>${sentence}</textarea></td></tr>`);
        table.push(...out);
      }
    });
    const indentation = '\n        ';
    return table.length ? `<table cellpadding="0" cellspacing="0">${indentation}${table.join(indentation)}\n</table>` : '';
  },
  createUpdate: (db, locale, table) => {
    const info = {table, db: JSON.stringify({locale, db})};
    return index.replace(/<\!--\$\{(.+?)\}-->|\/\*\$\{(.+?)\}\*\//g, ($0, $1, $2) => info[$1 || $2]);
  }
};