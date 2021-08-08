const {app, BrowserWindow, Menu, Tray, clipboard} = require('electron');
const path = require('path');
const {routine} = require('../lib');

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

async function refresh () {
    const can_change = await routine.account.authority();
    const thisfpr = routine.runtime.key.getFingerprint().toUpperCase();

    obj.tray.setContextMenu(Menu.buildFromTemplate([
        {
            label  : '登录',
            visible: !routine.account.fingerprint,
            click  : ()=>{
                create_login_window();
            }
        },
        {
            label  : (routine.account.fingerprint || '').slice(24) + (routine.account.object ? '(已登录)' : '(请求中)'),
            visible: routine.account.fingerprint,
            submenu: [
                {
                    label: '复制',
                    click () {
                        clipboard.writeText(routine.account.fingerprint);
                    }
                },
                {
                    label: '退出',
                    click (){
                        // todo 退出登录
                    }
                },
            ]
        },
        {
            label  : '所有设备',
            visible: routine.account.device.list().length > 0,
            submenu: routine.account.device.list().map(f=>{
                return {
                    label  : f.slice(24) + (f === thisfpr ? '(本机)' : ''),
                    submenu: [
                        {
                            label  : '删除',
                            enabled: can_change,
                            async click () {
                                await routine.account.device.remove(f);
                            }
                        },
                        {
                            label: '复制',
                            click () {
                                clipboard.writeText(f);
                            }
                        },
                        // todo 给设备发送消息
                        // {
                        //     label: '发送',
                        //     click () {
                        //     }
                        // },
                    ]
                };
            })
        },
        {
            label: '退出',
            click: ()=>{
                app.quit();
            }
        }
    ]));
}

async function init () {
    obj.tray = new Tray(path.join(__dirname, '../src/assets/logo_16x16.jpg'));
    await refresh();
    routine.account.on('change', async ()=>{
        await refresh();
    });
}

module.exports = {
    init,
};