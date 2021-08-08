const {app, BrowserWindow, Menu, Tray} = require('electron');
const path = require('path');

const obj = {
    tray: null,
};

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
        win.loadURL('http://localhost:8080/#login');
        win.webContents.openDevTools();
    }
    else {
        // todo 增加内容
    }
}

function init () {
    obj.tray = new Tray(path.join(__dirname, '../src/assets/logo_16x16.jpg'));

    obj.tray.setContextMenu(Menu.buildFromTemplate([
        {
            label: '登录',
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
    ]));
}

module.exports = {
    init,
};