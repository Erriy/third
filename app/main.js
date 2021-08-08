const {app, BrowserWindow, Menu, Tray} = require('electron');
const path = require('path');
const service = require('../lib');
const clipboard = require('./clipboard');
const api = require('./api');
const tray = require('./tray');

app.on('ready', async ()=>{
    try {
        await service.start({
            root     : path.join(process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'], '.third'),
            port     : 34105,
            bootstrap: [],
            service  : ['api'],
        });
    }
    catch(e) {
        // todo 提醒端口占用
        app.quit();
    }
    tray.init();
    api.init();
    clipboard.init();
});