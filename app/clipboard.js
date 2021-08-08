const {clipboard} = require('electron');
const {routine} = require('../lib');

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

        const getter = {
            darwin: ()=>(clipboard.read('public.file-url')),
            win32 : ()=>(clipboard.readBuffer('FileNameW').toString('ucs2'))
        }[process.platform];
        if(getter) {
            data = getter();
        }
    }
    else if (-1 !== fl.indexOf('text/plain')) {
        type = 'text';
        data = clipboard.readText();
    }
    else if (-1 !== fl.indexOf('image/png')) {
        type = 'image';
        data = clipboard.readImage().toPNG().toString();
    }
    if((type === obj.type && data === obj.data) || !data) {
        return false;
    }
    else if(obj.type === null && obj.data === null) {
        obj.type = type;
        obj.data = data;
        return false;
    }
    else {
        obj.type = type;
        obj.data = data;
        return true;
    }
}

async function send_to_other_devices () {
    const this_fpr = routine.runtime.key.getFingerprint().toUpperCase();
    await Promise.all(routine.account.device.list().map(async df=>{
        if(df === this_fpr) return;
        await routine.message.send({
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
    routine.message.on('clipboard', msg => {
        // 非信任设备拒绝同步
        if(-1 === routine.account.device.list().indexOf(msg.fingerprint)) return;
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