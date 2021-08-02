const { Command } = require('commander');
const cmd = new Command('account');
const {driver} = require('../../lib');

cmd.action(async ()=>{
    const r = await driver.account.info();
    console.log(r);
});

cmd
    .command('login')
    .option('--keyserver <string>', '指定keyserver', 'https://keyserver.ubuntu.com')
    .arguments('<keyid>')
    .action(async (keyid, opts)=>{
        const r = await driver.account.login({
            keyid,
            keyserver: opts.keyserver
        });
        console.log(r);
    });

cmd
    .command('allow')
    .action(async ()=>{

    });

cmd
    .command('remove')
    .action(async ()=>{

    });

module.exports = cmd;