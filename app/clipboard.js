const {clipboard} = require('electron');
const log = require('electron-log');
const engine = require('../lib');

const obj = {
    stop_watching: false,
    from         : null,
    type         : null,
    data         : null,
};

// todo 支持图片和文件跨平台传输

function read_clipboard () {
    const fl = clipboard.availableFormats();
    let type = null;
    let data = null;

    if (-1 !== fl.indexOf('text/plain')) {
        type = 'text';
        data = clipboard.readText();
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
    const this_fpr = engine.runtime.key.getFingerprint().toUpperCase();
    await Promise.all(engine.account.device.list().map(async df=>{
        if(df === this_fpr) return;
        try {
            await engine.rpc.invoke(df, 'third.sync.clipboard', {
                data: obj.data,
                type: obj.type
            });
        }
        catch(e) {}
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
    engine.rpc.regist('third.sync.clipboard', (data, rinfo)=>{
        if(!engine.account.device.has(rinfo.fingerprint)) return;

        obj.stop_watching = true;
        obj.type = data.type;
        obj.data = data.data;
        if(data.type === 'text') {
            clipboard.writeText(obj.data);
        }
        obj.stop_watching = false;
    });

    listen_clipboard_change();
    log.info('[clipboard.init] 剪贴板同步模块初始化完成');
}

module.exports = {
    init,
};