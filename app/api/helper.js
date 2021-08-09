const {dialog} = require('electron');

async function messagebox_yesorno (message, e) {
    console.log(e);
    const r = await dialog.showMessageBox({
        message: message,
        type   : 'question'
    });
    console.log(r);
    return r;
}

module.exports = {
    messagebox: {
        yes_or_no: messagebox_yesorno,
    }
};