const { Command } = require('commander');
const cmd = new Command('relay');
const {driver} = require('../../lib');

cmd
    .command('create')
    .requiredOption('-p, --port <number>', '指定要映射的端口')
    .option('-r, --relay <string>', '要使用的relay服务，不指定则与本地服务使用同一relay服务器', null)
    .action(async (opts)=> {
        const r = await driver.relay.create({port: opts.port, relay: opts.relay});
        console.log(r);
    });

cmd
    .command('list')
    .action(async ()=>{
        const r = await driver.relay.list();
        console.log(r);
    });

module.exports = cmd;