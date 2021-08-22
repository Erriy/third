const {app, clipboard, globalShortcut, dialog, Notification} = require('electron');
const path = require('path');
const log = require('electron-log');
const fs = require('fs');
const engine = require('../lib');

const obj = {
    stop_watching: false,
    this         : {
        type: null,
        text: null,
        file: {
            path: null,
            name: null,
        },
    },
    that: {
        fingerprint: null,
        type       : null,
        text       : null,
        file       : {
            path: null,
            name: null,
        },
    }
};

// todo 支持图片和文件跨平台传输
// todo 支持多文件拷贝（tar打包后发送，接收端解压缩）

function read_clipboard () {
    const fl = clipboard.availableFormats();
    let type = null;
    let text = null;
    let file = {path: null, name: null};

    if(-1 !== fl.indexOf('text/uri-list')) {
        type = 'file';

        const getter = {
            darwin: ()=>(clipboard.read('public.file-url').replace('file://', '')),
            win32 : ()=>(clipboard.readBuffer('FileNameW').toString('ucs2').replace('\x00', '')),
            // todo linux 文件路径解析
            // linux : ()=>('todo')
        }[process.platform];
        if(getter) {
            file.path = getter();
            file.name = path.basename(file.path);
        }
    }
    else if (-1 !== fl.indexOf('text/plain')) {
        type = 'text';
        text = clipboard.readText();
    }

    if(type === obj.this.type && text === obj.this.text && file.path === obj.this.file.path) {
        // 剪贴板没变
        return false;
    }
    if(!text && !file.path) {
        // 剪贴板清空，不同步
        return false;
    }

    const old_type = obj.this.type;
    obj.this.type = type;
    obj.this.text = text;
    obj.this.file = file;
    if(null === old_type){
        // 第一次扫描剪贴板，不同步
        return false;
    }

    return true;
}

async function send_to_other_devices () {
    const this_fpr = engine.runtime.key.getFingerprint().toUpperCase();
    await Promise.all(engine.account.device.list().map(async df=>{
        if(df === this_fpr) return;
        try {
            await engine.rpc.invoke(df, 'third.sync.clipboard', {
                method: 'set',
                info  : obj.this,
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

function regist_paste_file () {
    globalShortcut.register('CommandOrControl+Shift+V', async () => {
        if('file' !== obj.that.type) {
            // todo 提醒没有文件可供粘贴
            new Notification({ title: 'third 剪贴板', body: '没有文件可供粘贴' }).show();
            return;
        }
        const p = await dialog.showSaveDialog({defaultPath: path.join(app.getPath('downloads'), obj.that.file.name)});
        if(p.canceled) return;

        let file_stream = null;

        try {
            file_stream = await engine.rpc.invoke(obj.that.fingerprint, 'third.sync.clipboard', {
                method: 'get',
                path  : obj.that.file.path,
            });
        }
        catch(e) {
            new Notification({ title: 'third 剪贴板 文件拷贝错误', body: e.message }).show();
        }
        // todo 取消拷贝
        file_stream.pipe(fs.createWriteStream(p.filePath));
        file_stream.on('error', (e)=>{
            new Notification({ title: 'third 剪贴板 文件拷贝错误', body: e.message }).show();
        });
        file_stream.on('end', ()=>{
            new Notification({ title: 'third 剪贴板 文件拷贝完成', body: p.filePath }).show();
        });
    });
}

function init () {
    engine.rpc.regist('third.sync.clipboard', (data, rinfo)=>{
        if(!engine.account.device.has(rinfo.fingerprint)) return;

        if('set' === data.method ) {
            obj.stop_watching = true;
            Object.assign(obj.that, data.info);
            obj.that.fingerprint = rinfo.fingerprint;

            if(obj.that.type === 'text') {
                clipboard.writeText(obj.that.text);
            }
            obj.stop_watching = false;
            return;
        }
        else if('get' === data.method) {
            if(data.path) {
                return fs.createReadStream(data.path);
            }
        }
    });

    listen_clipboard_change();
    regist_paste_file();
    log.info('[clipboard.init] 剪贴板同步模块初始化完成');
}

module.exports = {
    init,
};