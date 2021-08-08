const {app, dialog} = require('electron');
const path = require('path');
const service = require('../lib');
const clipboard = require('./clipboard');
const api = require('./api');
const tray = require('./tray');

app.on('ready', ()=>{
    service.start({
        root: path.join(
            process.env[
                (process.platform == 'win32') ?
                    'USERPROFILE' :
                    'HOME'
            ],
            '.third'),
        port     : 34105,
        bootstrap: [],
        service  : ['api'],
    }).then(async ()=>{
        await tray.init();
        api.init();
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