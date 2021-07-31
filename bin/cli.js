#!/usr/bin/env node
const { Command } = require('commander');
const program = new Command('third');
const fs = require('fs');
const path = require('path');

const commands_path = path.join(__dirname, 'commands');
fs
    .readdirSync(commands_path)
    .filter(file=>file.endsWith('.js'))
    .forEach(file=>program.addCommand(require(path.join(commands_path, file))));

program
    .parse();
