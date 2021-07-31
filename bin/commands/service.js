const { Command } = require('commander');
const cmd = new Command('service');
const path = require('path');
const {service} = require('../../lib/');

cmd
    .option('--root <string>', '指定应用运行时根目录', path.join(process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'], '.third'))
    .option('-b, --bootstrap <string...>', '指定启动时连接的服务', 'http://third.on1y.net:5353')
    .option('-p, --port <number>', '指定服务端口', 34105)
    .option('-r, --relay <string>', '指定中继服务器', 'http://third.on1y.net:5353')
    .option('--enable-relay', '启动relay服务', false)
    .action(async (opts) => {
        const enable_services = ['api', 'local'];
        if(opts.enableRelay) {
            enable_services.push('relay');
        }
        await service.start({
            root     : opts.root,
            port     : opts.port,
            bootstrap: opts.bootstrap,
            relay    : opts.relay,
            service  : enable_services
        });
    });

module.exports = cmd;