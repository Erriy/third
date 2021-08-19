const { dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const schedule = require('node-schedule');
const log = require('electron-log');

autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        title    : '安装更新',
        message  : '新版本已下载完成，点击确定安装更新，取消则应用退出时自动安装',
        buttons  : ['确定', '取消'],
        defaultId: 0,
    }).then((button_id) => {
        if(button_id === 0) {
            setImmediate(() => autoUpdater.quitAndInstall());
        }
    });
});

async function check () {
    await autoUpdater.checkForUpdates();
}

function init () {
    // 每3小时自动检测一次更新
    schedule.scheduleJob('0 0 */3 * * *', async ()=>{
        await check();
    });
    setImmediate(check);
    log.info('[update.init] 更新模块初始化完成');
}

module.exports = {
    init,
    check,
};