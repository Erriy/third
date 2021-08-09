const {app, BrowserWindow, Menu, Tray, clipboard} = require('electron');
const path = require('path');
const {routine} = require('../lib');
const helper = require('./helper');

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

    win.setMenu(Menu.buildFromTemplate([{
        label  : '视图(&V)',
        submenu: [
            {
                label      : '开发者工具',
                role       : 'toggledevtools',
                accelerator: 'Shift+F12'
            }
        ]
    }]));

    win.loadURL(helper.vue_route('/login'));
    if(process.env.DEBUG) {
        win.webContents.openDevTools();
    }
}

async function refresh_account () {
    // 未进行登录操作
    if(!routine.account.fingerprint) {
        return [{
            label: '登录',
            click: ()=>{
                create_login_window();
            }
        }];
    }
    // 等待登录结果
    return [{
        label  : (routine.account.fingerprint || '').slice(24) + (routine.account.object ? '(已登录)' : '(请求中)'),
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
                    routine.account.logout();
                }
            },
        ]
    }];
}

async function refresh_device () {
    const can_change = await routine.account.authority();
    const thisfpr = routine.runtime.key.getFingerprint().toUpperCase();
    return [{
        label  : '我的设备',
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
    }];
}

async function refresh_request () {
    // 没有管理权限，则直接返回
    if(!await routine.account.authority()) return [];
    // 有管理权限但是没有登录请求，则返回空
    const requests = await routine.account.request();
    if(requests.length === 0) return [];

    return [{
        label  : '登录请求',
        submenu: (await routine.account.request()).map(f=>{
            return {
                label  : f.slice(24),
                submenu: [{
                    label: '允许登录',
                    async click () {
                        await routine.account.device.add(f);
                    }
                }]
            };
        })
    }];
}

async function refresh () {

    // todo 临时不接受某些终端的同步/不发送给某些终端
    // todo 打开配置文件
    // todo 关于，自动更新、手动更新
    // todo 修改本机名称

    const template = [
        ... await refresh_account(),
        ... await refresh_device(),
        ... await refresh_request(),
        {
            label: '退出',
            click: ()=>{
                app.quit();
            }
        }
    ];

    obj.tray.setContextMenu(Menu.buildFromTemplate(template));
}

async function init () {
    obj.tray = new Tray(path.join(__dirname, './resource/logo_16x16.jpg'));
    await refresh();
    obj.tray.on('click', ()=>{
        obj.tray.popUpContextMenu();
    });

    routine.account.on('change', async ()=>{
        await refresh();
    });
}

module.exports = {
    init,
};