const { Command } = require('commander');
const {service} = require('../lib/');
const cmd = new Command('service');

cmd
    .command('start')
    .action(async () => {
        await service.start();
        console.log('service start');
    });

cmd
    .command('restart')
    .action(()=>{
        console.log('service restart');
    });

cmd
    .command('stop')
    .action(() => {
        console.log('service stop');
    });

module.exports = cmd;