#!/usr/bin/env node
const { Command } = require('commander');
const program = new Command('third');

program
    .addCommand(require('./service'))
    .addCommand(require('./key'))
    .addCommand(require('./relay'))
    .addCommand(require('./lookup'))
    .addCommand(require('./message'))
    .parse();
