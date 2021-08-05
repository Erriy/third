const {clipboard} = require('electron');
const {service} = require('../lib');

const obj = {
    stop_watching: false,
    from         : null,
    type         : null,
    data         : null,
};

function read_clipboard () {
    // todo 文本、图片、文件
    const fl = clipboard.availableFormats();
    let type = null;
    let data = null;

    if(-1 !== fl.indexOf('text/uri-list')) {
        type = 'file';
        data = clipboard.read('public.file-url');
    }
    else if (-1 !== fl.indexOf('text/plain')) {
        type = 'text';
        data = clipboard.readText();
    }
    else if (-1 !== fl.indexOf('image/png')) {
        type = 'image';
        data = clipboard.readImage().toPNG().toString();
    }

    if((!obj.type && !obj.data) || (type === obj.type && data === obj.data)) {
        return false;
    }
    obj.type = type;
    obj.data = data;
    return true;
}

function write_clipboard () {

    clipboard.writeBuffer(
        'public.file-url',
        Buffer.from('file:///Users/erriy/Downloads/Bartender_4_4.1.0__TNT__xclient.info.dmg.zip')
    );
}

async function send_to_other_devices () {
    const this_fpr = service.routine.runtime.key.getFingerprint().toUpperCase();
    await Promise.all(service.routine.account.device.list().map(async df=>{
        if(df === this_fpr) return;
        await service.routine.message.send({
            type       : 'clipboard',
            fingerprint: df,
            data       : {
                data: obj.data,
                type: obj.type
            },
        });
    }));
}

function listen_clipboard_change () {
    setInterval(async () => {
        if(obj.stop_watching) {
            return;
        }
        read_clipboard() && await send_to_other_devices();
    }, 500);
}

function init () {
    service.routine.message.on('clipboard', msg => {
        // 非信任设备拒绝同步
        if(-1 === service.routine.account.device.list().indexOf(msg.fingerprint)) return;
        // 设置剪贴板
        obj.stop_watching = true;
        obj.type = msg.data.type;
        obj.data = msg.data.data;
        if(obj.type === 'text') {
            clipboard.writeText(obj.data);
        }
        obj.stop_watching = false;
    });
    listen_clipboard_change();
}

module.exports = {
    init,
};