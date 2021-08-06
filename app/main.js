const {app, BrowserWindow, Menu, Tray} = require('electron');
const path = require('path');
const {service} = require('../lib');
const clipboard = require('./clipboard');
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
            nodeIntegration : true,
            contextIsolation: false,
        }
    });
    if(process.env.DEBUG) {
        win.loadURL('http://localhost:8080');
        win.webContents.openDevTools();
    }
    else {
        // todo 增加内容
    }
    obj.win = win;
}

function create_login_window () {
    const win = new BrowserWindow({
        width         : 800,
        height        : 600,
        resizable     : false,
        fullscreenable: false,
        // visibleOnAllWorkspaces: true,
        hasShadow     : false,
        webPreferences: {
            nodeIntegration : true,
            contextIsolation: false,
        }
    });
    if(process.env.DEBUG) {
        win.loadURL('http://localhost:8080');
        win.webContents.openDevTools();
    }
    else {
        // todo 增加内容
    }
}

function init_tray () {
    obj.tray = new Tray(path.join(__dirname, '../src/assets/logo_16x16.jpg'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '账号',
            click: ()=>{
                create_login_window();
            }
        },
        {
            label: '退出',
            click: ()=>{
                app.quit();
            }
        }
    ]);
    obj.tray.setContextMenu(contextMenu);
}

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

    // todo 带命令行启动则不执行
    if(process.platform === 'darwin') {
        // app.dock.hide();
    }
    init_tray();
    // create_main_window();
    api.init();
    clipboard.init();

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