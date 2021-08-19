#!/usr/bin/env node
const { Command } = require('commander');
const program = new Command('third');
const path = require('path');
const engine = require('../lib');

program
    .option('--database <string>', '指定应用运行时数据库文件位置', path.join(process.env.HOME || process.env.USERPROFILE, '.third/database'))
    .option('-b, --bootstrap <string...>', '指定启动时连接的服务', ['http://third.on1y.net:5353'])
    .option('-r, --relay <string>', '指定中继服务器', null)
    .option('-p, --port <number>', '指定服务端口号', 34105)
    .option('--enable-relay', '启动relay服务', false)
    .option('--disable-mdns', '禁用mdns内网自发现服务', false)
    .option('--provider', '支持kns存储查询服务', false)
    .action(async (opts) => {
        await engine.init({
            database : opts.database,
            port     : opts.port,
            mdns     : !opts.disableMdns,
            relay    : opts.relay,
            bootstrap: opts.bootstrap,
            service  : {
                kns  : opts.provider,
                relay: opts.enableRelay,
                mdns : !opts.disableMdns,
            }
        });
    });

program.parse();
