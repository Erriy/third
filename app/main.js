const {app, dialog} = require('electron');
const service = require('../lib');
const clipboard = require('./clipboard');
const api = require('./api');
const tray = require('./tray');
const helper = require('./helper');
const update = require('./update');

app.on('ready', ()=>{
    service.start({
        root     : helper.root,
        port     : 34105,
        bootstrap: [],
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