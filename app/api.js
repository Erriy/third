const {
    ipcMain,
} = require('electron');
const fs = require('fs');
const path = require('path');
const log = require('electron-log');

function generate_channel (module, channel_prefix) {
    Object.keys(module)
        .filter(name=>!name.startsWith('_'))
        .forEach(n=>{
            const channel = channel_prefix + n;
            if(typeof module[n] === 'function') {
                ipcMain.handle(
                    channel,
                    (event, ... args)=>(module[n](...args, event))
                );
            }
            else {
                generate_channel(module[n], channel + '.');
            }
        });
}

function regist_api_modules (modules_path) {
    fs.readdirSync(modules_path).forEach((file)=>{
        if(!file.endsWith('.js')) return;
        const module_name = file.slice(0, file.length - 3);
        const md = require(path.join(modules_path, module_name));
        generate_channel(md, module_name + '.');
    });
}

function init () {
    regist_api_modules(path.join(__dirname, 'api'));
    log.info('[api.init] 提供给gui的api模块初始化完成');
}

module.exports = {
    init,
};