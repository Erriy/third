const { Command } = require('commander');
const {service} = require('../lib/');
const cmd = new Command('service');

cmd
    .option('-b, --bootstrap <string>', '指定启动时连接的服务', '')
    .option('-p, --port <number>', '指定服务端口', 34105)
    .option('-r, --relay <string>', '指定中继服务器', null)
    .action(async (opts) => {
        const bootstrap = opts.bootstrap.split(',').filter(x=>x.length);
        await service.start({bootstrap, port: opts.port, relay: opts.relay});
    });

module.exports = cmd;