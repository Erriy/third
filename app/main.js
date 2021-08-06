const {app, BrowserWindow, Menu, Tray} = require('electron');
const path = require('path');
const {service} = require('../lib');
const clipboard = require('./clipboard');
const command = require('../bin');
const api = require('./api');

const obj = {
    tray: null,
    win : null,
};

function create_main_window () {
    const win = new BrowserWindow({
        width         : 800,
        height        : 600,
        resizable     : false,
        fullscreenable: false,
        // visibleOnAllWorkspaces: true,
        hasShadow     : false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        }
    });
    win.loadURL(`file://${__dirname}/view/login.html`);
    win.webContents.openDevTools();
    obj.win = win;
}

function init_tray () {
    obj.tray = new Tray(path.join(__dirname, 'assets/logo_16x16.jpg'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '退出',
            click: ()=>{
                app.quit();
            }
        }
    ]);
    obj.tray.setContextMenu(contextMenu);
}

app.on('ready', ()=>{

    command(process.argv).then(()=>{
        // todo 带命令行启动则不执行
        if(process.platform === 'darwin') {
            // app.dock.hide();
        }
        init_tray();
        create_main_window();
        api.init();
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