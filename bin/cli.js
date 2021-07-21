#!/usr/bin/env node
const { Command } = require('commander');
const program = new Command();

program
    .addCommand(require('./service'))
    .addCommand(require('./key'))
    .addCommand(require('./relay'))
    .parse();
