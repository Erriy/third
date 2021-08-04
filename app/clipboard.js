const {clipboard} = require('electron');
const {service} = require('../lib');

const obj = {
    stop_watching: false,
    text         : null,
};

function listen_clipboard_change () {
    setInterval(async () => {
        if(obj.stop_watching) {
            return;
        }

        const text = clipboard.readText();
        if(text === obj.text) {return;}

        obj.text = text;

        await Promise.all(service.routine.account.device.list().map(async df=>{
            await service.routine.message.send({
                fingerprint: df,
                data       : obj.text,
                type       : 'clipboard'
            });
        }));
    }, 500);
}

function init () {
    service.routine.message.on('clipboard', msg => {
        console.log(msg);
    });
    listen_clipboard_change();
}

module.exports = {
    init,
};