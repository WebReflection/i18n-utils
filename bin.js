#!/usr/bin/env node

const inquirer = require('inquirer');
const program = require('commander');
const opn = require('opn');
const i18nUtils = require('./index.js');
const info = require('./package.json');

program
  .version(info.version)
  .usage('[options] <program>')
  .option('-l, --locale <lang>', 'specify default language used in the program: en, it, or en-US')
  .option('-t, --translations <t1,t2,t3>', 'translation targets: it,de,fr')
  .option('-o, --output <db.json>', 'the database file to create/update')
  .option('-p, --port <localhost:port>', 'localhost port for updates (1185 by default)')
  .action(function (program, options) {
    const fs = require('fs');
    const path = require('path');
    let file = path.resolve(process.cwd(), program);
    fs.stat(file, (err, stat) => {
      if (err) throw err;
      if (!stat.isFile()) throw `unknown file ${file}`;
      const questions = [];
      if (!options.locale) questions.push({
        name: 'locale',
        message: 'default language?',
        default: 'en'
      });
      if (!options.output) questions.push({
        name: 'output',
        message: 'where to save the database?',
        default: 'i18n.db.json'
      });
      inquirer.prompt(questions).then(answers => {
        const askLanguages = (existent, translations) => {
          inquirer.prompt(options.translations ? [] : [{
            name: 'translations',
            message: `you are translating '${locale}' to which language?`,
            default: translations.join(', ') || 'comma separated list: de, it, fr',
            validate(value) {
              return /^\s*[^,\s]+(?:\s*,\s*[^,\s]+)*?\s*$/.test(value);
            }
          }]).then(answers => {
            const table = i18nUtils.createTable(
              db,
              locale,
              existent,
              (options.translations || answers.translations).trim().split(/\s*,\s*/)
            );
            if (table) {
              const server = require('http').createServer((req, res) => {
                switch (req.url) {
                  case '/':
                    res.writeHead(200, {'Content-Type': 'text/html'});
                    res.end(i18nUtils.createUpdate(db, locale, table));
                    break;
                  case '/exit':
                    res.writeHead(200, 'OK');
                    res.end('OK');
                    setTimeout(
                      () => {
                        server.close();
                        console.log('Done');
                      },
                      200
                    );
                    break;
                  case '/update':
                    if (/post/i.test(req.method)) {
                      var body = [];
                      req.on('data', data => body.push(data));
                      req.on('end', () => {
                        try {
                          JSON.parse(body.join(''));
                          fs.writeFile(file, body.join(''), (err) => {
                            if (err) {
                              res.writeHead(500, 'Internal Server Error');
                              res.end(e);
                            } else {
                              res.writeHead(200, 'OK');
                              res.end('OK');
                            }
                          });
                        } catch (e) {
                          res.writeHead(400, 'Bad Request');
                          res.end(e);
                        }
                      });
                      break;
                    }
                  default:
                    res.writeHead(404, 'Not Found');
                    res.end();
                    break;
                }
              }).listen(options.port || 1185, () => {
                const url = `http://localhost:${options.port || 1185}/`;
                opn(url).then(() => console.log('Updating via ' + url));
              });
            } else {
              console.log('OK');
            }
          });
        };
        const locale = options.locale || answers.locale;
        const output = options.output || answers.output;
        const db = i18nUtils.createDefaultDB(file, {locale});
        file = path.resolve(process.cwd(), output);
        fs.stat(file, (err, stat) => {
          if (!err && stat.isFile()) {
            const existent = require(file);
            const key = Object.keys(existent)[0];
            askLanguages(existent, Object.keys(existent[key] || {}).filter(lang => lang !== locale));
          } else {
            askLanguages({}, []);
          }
        });
      });
    });
  })
  .parse(process.argv);
