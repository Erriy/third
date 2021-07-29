const { Command } = require('commander');
const {service} = require('../lib/');
const cmd = new Command('service');
const path = require('path');

cmd
    .option('--root <string>', '指定应用运行时根目录', path.join(process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'], '.third'))
    .option('-b, --bootstrap <string>', '指定启动时连接的服务', 'http://third.on1y.net:5353')
    .option('-p, --port <number>', '指定服务端口', 34105)
    .option('-r, --relay <string>', '指定中继服务器', 'http://third.on1y.net:5353/')
    .option('--disable-clipboard', '禁止同步剪贴板', false)
    .action(async (opts) => {
        const bootstrap = opts.bootstrap.split(',').filter(x=>x.length);
        await service.start({
            root            : opts.root,
            bootstrap,
            port            : opts.port,
            relay           : opts.relay,
            enable_clipboard: !opts.disableClipboard
        });
    });

module.exports = cmd;