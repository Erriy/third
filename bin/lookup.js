const { Command } = require('commander');
const cmd = new Command('lookup');
const {driver} = require('../lib');

cmd
    .arguments('<fingerprint>', '要查询的指纹')
    .action(async (fingerprint) => {
        await driver.init();
        try {
            console.log(await driver.ticket.lookup(fingerprint));
        }
        catch (e) {
            console.error(e.message);
        }
    });

module.exports = cmd;