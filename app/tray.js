const {app, BrowserWindow, Menu, Tray, clipboard, shell} = require('electron');
const path = require('path');
const engine = require('../lib');
const runtime = require('./runtime');
const update = require('./update');

const obj = {
    tray: null,
};

async function refresh_account () {
    // 未进行登录操作
    if(!engine.account.status.login) {
        return [{
            label: '登录',
            click: ()=>{
            }
        }];
    }
    // 等待登录结果
    return [{
        label  : engine.account.fingerprint.slice(24) + (engine.account.status.wait ? '(已登录)' : '(请求中)'),
        submenu: [
            {
                label: '复制',
                click () {
                    clipboard.writeText(engine.account.fingerprint);
                }
            },
            {
                label: '退出',
                click (){
                    engine.account.logout();
                }
            },
        ]
    }];
}

async function refresh_device () {
    return [];
}

async function refresh_request () {
    return [];
}

async function refresh () {

    // todo 临时不接受某些终端的同步/不发送给某些终端
    // todo 修改本机名称

    const template = [
        ... await refresh_account(),
        ... await refresh_device(),
        ... await refresh_request(),
        {
            label: '打开配置文件',
            async click () {
                await shell.openPath(runtime.config.path);
            }
        },
        {
            label  : `关于 (v${app.getVersion()})`,
            submenu: [
                {
                    label: '项目主页',
                    click () {
                        shell.openExternal('https://github.com/erriy/third');
                    }
                },
                {
                    label: '检查更新',
                    click () {
                        setImmediate(update.check);
                    }
                },
            ]
        },
        {
            label: '退出',
            click: ()=>{
                app.quit();
            }
        },
    ];

    obj.tray.setContextMenu(Menu.buildFromTemplate(template));
}

function init () {
    obj.tray = new Tray(path.join(__dirname, './resource/logo_16x16.jpg'));

    obj.tray.on('click', ()=>{
        obj.tray.popUpContextMenu();
    });

    engine.runtime.on('account.*', async ()=>{
        await refresh();
    });
    setImmediate(refresh);
}

module.exports = {
    init,
};