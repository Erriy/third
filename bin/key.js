const { Command } = require('commander');
const cmd = new Command('key');
const {driver} = require('../lib');

cmd
    .command('fingerprint')
    .action(async () => {
        await driver.init();
        console.log(await driver.key.fingerprint());
    });

cmd
    .command('refresh')
    .action(() => {
    });

module.exports = cmd;