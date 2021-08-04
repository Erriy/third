#!/usr/bin/env node
const { Command } = require('commander');
const program = new Command('third');
const fs = require('fs');
const path = require('path');
const {driver, service} = require('../lib');

const commands_path = path.join(__dirname, 'commands');
fs
    .readdirSync(commands_path)
    .filter(file=>file.endsWith('.js'))
    .forEach(file=>program.addCommand(require(path.join(commands_path, file))));

// todo 本地服务支持unix socket连接，本地即可不用指定端口
program
    .option('-u, --url <string>', '指定服务url', null)
    .option('-h, --host <string>', '指定服务主机', '127.0.0.1')
    .option('-p, --port <number>', '指定服务的端口', 34105)
    .enablePositionalOptions()
    .hook('preAction', async (thisCommand, actionCommand) => {
        await driver.init({
            url : thisCommand.opts().url,
            port: thisCommand.opts().port,
            host: thisCommand.opts().host
        });
    });

program
    .option('--root <string>', '指定应用运行时根目录', path.join(process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'], '.third'))
    .option('-b, --bootstrap <string...>', '指定启动时连接的服务', 'http://third.on1y.net:5353')
    .option('-r, --relay <string>', '指定中继服务器', null)
    .option('--enable-relay', '启动relay服务', false)
    .option('--provider', '支持ticket存储查询服务', false)
    .action(async (opts) => {
        const enable_services = ['api', 'admin'];
        if(opts.enableRelay) {
            enable_services.push('relay');
        }
        if(opts.relay && !opts.relay.endsWith('/')) {
            opts.relay += '/';
        }
        await service.start({
            root     : opts.root,
            port     : opts.port,
            bootstrap: opts.bootstrap,
            relay    : opts.relay,
            service  : enable_services,
            provider : opts.provider,
        });
    });

if(require.main === module) {
    program.parse();
}
else {
    module.exports = function (argv) {
        return program.parseAsync(argv);
    };
}
