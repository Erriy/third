const {app, BrowserWindow} = require('electron');
const path = require('path');
const {service} = require('../lib');
const clipboard = require('./clipboard');
const command = require('../bin');

app.on('ready', ()=>{

    command(process.argv).then(()=>{
        clipboard.init();
    }).catch(()=>{
        app.quit();
    });

    // const win = new BrowserWindow({
    //     width                 : 300,
    //     height                : 500,
    //     frame                 : false,
    //     resizable             : false,
    //     fullscreenable        : false,
    //     transparent           : true,
    //     visibleOnAllWorkspaces: true,
    //     hasShadow             : false
    // });
    // app.dock.hide();
    // win.setIgnoreMouseEvents(true);
    // win.setAlwaysOnTop(true, 'floating');

    // // Or load a local HTML file
    // win.loadURL(`file://${__dirname}/view/index.html`);
});