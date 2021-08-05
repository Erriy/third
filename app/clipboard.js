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
        // 非信任设备拒绝同步
        if(-1 === service.routine.account.device.list().indexOf(msg.fingerprint)) return;
        // 设置剪贴板
        obj.stop_watching = true;
        obj.text = msg.data;
        clipboard.writeText(msg.data);
        obj.stop_watching = false;
    });
    listen_clipboard_change();
}

module.exports = {
    init,
};