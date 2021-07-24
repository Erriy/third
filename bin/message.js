const { Command } = require('commander');
const cmd = new Command('message');
const {driver} = require('../lib');

cmd
    .command('send')
    .requiredOption('--to <string>', '对方的keyid')
    .requiredOption('-m, --message <string>', '消息内容')
    .option('-t, --type <string>', '消息类型', undefined)
    .action(async (opts) => {
        await driver.init();
        const r = await driver.message.send(opts.to, opts.message, opts.type);
        if(200 === r.code) {
            console.log(r.message);
        }
        else {
            console.error(r.message);
            process.exit(-1);
        }
    });

module.exports = cmd;