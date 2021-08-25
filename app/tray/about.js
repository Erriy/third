const {app, shell, clipboard} = require('electron');
const update = require('../update');

async function about () {
    return [{
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
                    update.check().then();
                }
            },
        ]
    },];
}

module.exports = about;