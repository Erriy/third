const { dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

function check ({
    show_error = false,
}) {
    return new Promise(function (resolve, reject) {
        autoUpdater.autoDownload = false;
        autoUpdater.on('error', (error) => {
            if(show_error) {
                dialog.showErrorBox('Error: ', error == null ? 'unknown' : (error.stack || error).toString());
            }
            return reject();
        });

        dialog.showMessageBox({
            type     : 'info',
            title    : '更新提醒',
            message  : '发现新版本，是否下载更新？',
            buttons  : ['确定', '取消'],
            defaultId: 0
        }).then((button_index) => {
            if(1 === button_index) return resolve();
            autoUpdater.downloadUpdate();
        });

        autoUpdater.on('update-not-available', () => {
            dialog.showMessageBox({
                title  : '无更新',
                message: '当前为最新版本，无需更新'
            });
            return resolve();
        });
        autoUpdater.on('update-downloaded', () => {
            dialog.showMessageBox({
                title  : '安装新版本',
                message: '更新内容已下载完成，点击确定后安装新版本'
            }).then(() => {
                setImmediate(() => autoUpdater.quitAndInstall());
                return resolve();
            });
        });

        autoUpdater.checkForUpdates().then();
    });
}

module.exports = {
    check,
};