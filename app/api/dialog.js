const { dialog } = require('electron');

function yes_or_no ({
    title = undefined,
    message = undefined,
} = {}) {
    return new Promise((resolve)=>{
        dialog.showMessageBox({
            title,
            message,
            buttons  : ['确定', '取消'],
            defaultId: 0,
        }).then((r) => {
            return resolve(r.response === 0);
        });
    });
}

function notify ({
    title = undefined,
    message = undefined,
} = {}) {
    return new Promise((resolve)=>{
        dialog.showMessageBox({
            title,
            message,
        }).then(() => {
            return resolve();
        });
    });
}

module.exports = {
    yes_or_no,
    notify,
};