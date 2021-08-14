const path = require('path');
const {app, dialog} = require('electron');
const log = require('electron-log');
const engine = require('../lib');
const runtime = require('./runtime');
const tray = require('./tray');
const update = require('./update');
const api = require('./api');
const clipboard = require('./clipboard');

app.on('ready', ()=>{
    const c = runtime.config;
    engine.init({
        database : path.join(runtime.root, 'third.db'),
        port     : c.get('port'),
        bootstrap: c.get('bootstrap'),
        mdns     : true,
        provider : false,
        logger   : log,
    }).then(async ()=>{
        tray.init();
        api.init();
        update.init();
        clipboard.init();
    }).catch(e=>{
        dialog.showMessageBox(null, {
            type   : 'error',
            message: e
        });
        app.quit();
    });
});

app.on('window-all-closed', (e)=>{
    e.preventDefault();
});