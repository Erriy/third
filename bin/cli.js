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
    .option('-p, --port <number>', '指定本地服务的端口', 34105)
    .enablePositionalOptions()
    .hook('preAction', async (thisCommand, actionCommand) => {
        await driver.init({port: thisCommand.opts().port});
    });

program
    .parse();
