const ascjs = require('ascjs');
const escape = require('html-escaper').escape;
const esprima = require('esprima');
const defaultOptions = {
  sourceType: 'module',
  jsx: true,
  range: true,
  tolerant: true
};

const fs = require('fs');
const path = require('path');

const parse = (options, base, file, cache, db) => {
  let code = fs.readFileSync(file).toString();
  if (/^(?:import|export)\s+/m.test(code)) code = ascjs(code);
  const parseMore = (module, name) => {
    if (!cache.has(name)) {
      cache.add(name);
      parse(options, path.dirname(name), name, cache, db);
    }
  };
  esprima.parse(
    code,
    options,
    item => {
      switch (item.type) {
        case 'TaggedTemplateExpression':
          if (item.tag.name === 'i18n') {
            const template = item.quasi.quasis.map(quasi => quasi.value.raw);
            db[template.join('\x01')] = {
              t: template,
              v: item.quasi.expressions.map((expression, i) => i)
            };
          }
          break;
        case 'CallExpression':
          switch (item.callee.name) {
            case 'import':
            case 'require':
              const module = item.arguments[0];
              let name = '';
              process.chdir(base);
              try { name = require.resolve(module.value); } catch(e) {}
              if (name !== module.value && /\.m?js$/.test(name)) {
                parseMore(module, name);
              } else {
                console.log('  ignoring ' + module.value);
              }
              break;
          }
          break;
      }
    }
  );
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
    const keys = Object.keys(db[locale]);
    translations.forEach(lang => {
      const target = existent[lang];
      if (target) {
        Object.keys(target).forEach(key => {
          if (keys.indexOf(key) < 0) {
            delete target[key];
          }
        });
      }
      db[lang] = target || {};
    });
    keys.forEach(key => {
      const out = [];
      const source = db[locale][key];
      const sentence = source.t.map((chunk, i) => {
        return (i ? ('${' + (i - 1) + '}') : '') + chunk;
      }).join('');
      translations.forEach(lang => {
        const target = db[lang];
        if (!target.hasOwnProperty(key)) {
          target[key] = {t: source.t, v: source.v};
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
  createUpdate: (db, locale, table) => `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1.0">
      <title>i18n Database Translations</title>
      <style>
      html {
        font-family: sans-serif;
        box-sizing: border-box;
      }
      *, *:before, *:after {
        box-sizing: inherit;
      }
      table {
        border-left: 1px solid #CCC;
        border-right: 1px solid #CCC;
        border-bottom: 1px solid #CCC;
      }
      table, textarea {
        width: 100%;
      }
      td {
        padding: 8px;
      }
      tr.native {
        background: #F5F5F5;
      }
      tr.native > td {
        border-top: 1px solid #CCC;
        border-bottom: 1px solid #DDD;
      }
      tr.native > td:first-child {
        font-weight: bold;
      }
      button {
        margin: 8px auto;
        width: 100%;
        min-height: 40px;
        font-weight: bold;
      }
      </style>
      <script>
      const i18n=${JSON.stringify({locale, db})};
      function updateDB() {
        [].forEach.call(document.querySelectorAll('tr.native'), updateDBEntry);
        fetch('/update', {
          method: 'post',
          body: JSON.stringify(i18n.db)
        })
          .then(response => response.text())
          .then(text => {
            if (confirm('Database updated.\\nWould you like to exit?')) {
              fetch('/exit').then(response => response.text()).then(() => close());
            }
          })
          .catch(e => alert(e))
        ;
      }
      function updateDBEntry(row) {
        var
          key = row.getAttribute('data-key'),
          lang = row.querySelector('td').textContent,
          updates = [row]
        ;
        while (
          row &&
          (row = row.nextElementSibling) &&
          (row.className !== 'native')
        ) {
          updates.push(row);
        }
        row = updates.shift();
        updates.forEach(parseDBEntry, {
          key,
          values: i18n.db[lang][key].v
        });
      }
      function parseDBEntry(row) {
        const lang = row.querySelector('td').textContent;
        const text = row.querySelector('textarea').value;
        const grab = (t, ...v) => {
          i18n.db[lang][this.key] = {
            t: t.slice(),
            v: v.map(value => {
              const i = this.values.indexOf(value);
              if (i < 0) throw new Error(\x60Unable to define \x24{lang} sentence: \x24{text}\x60);
              return i;
            })
          };
        };
        eval('grab\x60' + text + '\x60');
      }
      </script>
    </head>
    <body>
      ${table}
      <button onclick="updateDB()">update translations</button>
    </body>
  </html>`
};