const path = require('path');
const {app, dialog} = require('electron');
const log = require('electron-log');
const engine = require('../lib');
const runtime = require('./runtime');
const tray = require('./tray');
const update = require('./update');
const clipboard = require('./clipboard');

if(process.platform === 'darwin') {
    // note mac 系统下electron打包后因为环境变量问题会导致command-exists和node-gpg执行错误，主动添加环境变量可以解决问题
    process.env.PATH = [process.env.PATH || '', '/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'].join(':');
}

app.on('ready', ()=>{
    const c = runtime.config;
    log.info('[app.ready] electron 环境准备完毕，开始启动应用');
    engine.init({
        database : path.join(runtime.root, 'third.db'),
        port     : c.get('port'),
        bootstrap: c.get('bootstrap'),
        relay    : c.get('relay'),
        mdns     : true,
        provider : false,
        logger   : log,
    }).then(async ()=>{
        tray.init();
        update.init();
        clipboard.init();
    }).catch(e=>{
        dialog.showMessageBox({
            type   : 'error',
            message: e.message
        });
        app.quit();
    });
});

app.on('window-all-closed', (e)=>{
    e.preventDefault();
});