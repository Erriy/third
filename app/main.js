const {app, dialog} = require('electron');
const service = require('../lib');
const clipboard = require('./clipboard');
const api = require('./api');
const tray = require('./tray');
const runtime = require('./runtime');
const update = require('./update');

app.on('ready', ()=>{
    const c = runtime.config;
    service.start({
        root     : runtime.root,
        port     : c.get('port'),
        bootstrap: c.get('bootstrap'),
        relay    : c.get('relay'),
        service  : ['api'],
    }).then(async ()=>{
        await tray.init();
        api.init();
        clipboard.init();
        update.init();
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