const {dialog} = require('electron');

async function messagebox_yesorno ({
    title,
    message,
}, e) {
    const r = await dialog.showMessageBox({
        title    : title,
        message  : message,
        type     : 'info',
        buttons  : ['确定', '取消'],
        defaultId: 0,
    });
    return r.response;
}

module.exports = {
    messagebox: {
        yes_or_no: messagebox_yesorno,
    }
};