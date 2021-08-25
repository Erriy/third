const {Tray, Menu, app} = require('electron');
const log = require('electron-log');
const path = require('path');
const device = require('./device');
const local = require('./local');
const trust = require('./trust');
const about = require('./about');
const engine = require('../../lib');

const obj = {
    tray: null
};

async function refresh () {
    const template = [
        ... await device(),
        ... await trust(),
        ... await local(),
        ... await about(),
        {
            label: '退出',
            click () {
                app.quit();
            }
        }
    ];
    obj.tray.setContextMenu(Menu.buildFromTemplate(template));
}

function init () {
    obj.tray = new Tray(path.join(__dirname, '../resource/logo_16x16.jpg'));

    obj.tray.on('click', async ()=>{
        await refresh();
        obj.tray.popUpContextMenu();
    });

    engine.runtime.on('kns.device.local', refresh);
    engine.runtime.on('trust.*', refresh);

    log.info('[tray.init] 托盘处理程序初始化完成');
}

module.exports = {
    init,
};