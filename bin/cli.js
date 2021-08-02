#!/usr/bin/env node
const { Command } = require('commander');
const program = new Command('third');
const fs = require('fs');
const path = require('path');
const {driver} = require('../lib');

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
    .parse();
