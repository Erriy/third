const { Command } = require('commander');
const cmd = new Command('relay');
const {driver} = require('../lib');

cmd
    .command('list')
    .action(async () => {
        await driver.init();
        console.log(await driver.relay.list());
    });

cmd
    .command('create')
    .requiredOption('-p, --port <number>', '指定端口')
    .requiredOption('-r, --relay <string>', '指定中继服务器')
    .action(async (opts) => {
        // todo 默认暴露代理地址到kns，可以通过选项禁止
        await driver.init();
        await driver.relay.create(opts.port, opts.relay);
    });

cmd
    .command('remove')
    .option('-p, --port <number>', '指定端口')
    .option('-r, --relay <string>', '指定中继服务器')
    .action(async (opts) => {
        await driver.init();
        await driver.relay.remove({port: opts.port, relay: opts.relay});
    });

module.exports = cmd;