const { Command } = require('commander');
const cmd = new Command('relay');
const {driver} = require('../../lib');

// fixme 格式化输出
cmd
    .command('create')
    .argument('<port>', '指定要映射的端口')
    .option('-r, --relay <string>', '要使用的relay服务，不指定则与本地服务使用同一relay服务器', null)
    .action(async (port, opts)=> {
        const r = await driver.relay.create({port, relay: opts.relay});
        console.log(r);
    });

cmd
    .command('remove')
    .argument('<port>', '指定要终止映射的端口')
    .action(async (port)=>{
        const r = await driver.relay.remove(port);
        console.log(r);
    });

cmd
    .command('get')
    .argument('<port>', '指定要映射的端口')
    .action(async (port)=>{
        const r = await driver.relay.get(port);
        if(200 === r.code) {
            console.log(r.relay);
        }
        else {
            console.error(r.message);
            process.exit(-1);
        }
    });

cmd.action(async ()=>{
    const r = await driver.relay.list();
    console.log(r);
});

module.exports = cmd;