const {app, clipboard, globalShortcut, dialog, Notification} = require('electron');
const path = require('path');
const log = require('electron-log');
const fs = require('fs');
const engine = require('../lib');

const obj = {
    stop_watching: false,
    this         : {
        first: true,
        type : null,
        text : null,
        file : {
            path: null,
            name: null,
        },
    },
    remote: {
        fingerprint: null,
        type       : null,
        text       : null,
        file       : {
            path: null,
            name: null,
        },
    }
};

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
    obj.this.type = type;
    obj.this.text = text;
    obj.this.file = file;
    if(obj.this.first) {
        // 初次获取，不同步
        obj.this.first = false;
        return false;
    }
    return true;
}

async function send () {
    await Promise.all((await engine.trust.list()).map(async d=>{
        if(!d.config.clipboard.send) return;

        try {
            await engine.rpc.invoke(
                d.fingerprint,
                'third.sync.clipboard',
                {
                    method: 'set',
                    info  : {
                        type: obj.this.type,
                        text: obj.this.text,
                        file: obj.this.file
                    }
                }
            );
        }
        catch(e) {
            log.error(e);
        }
    }));
}

function watch_clipboard () {
    setInterval(async ()=>{
        !obj.stop_watching && read_clipboard() && await send();
    }, 500);
}

async function recv (data, rinfo) {
    // 不信任或不接收
    const t = await engine.trust.get(rinfo.fingerprint);
    if(!t || !t.clipboard.recv) return;

    // 拉取文件
    if('get' === data.method) {
        if(data.path) {
            return fs.createReadStream(data.path);
        }
        throw new Error('未指定路径');
    }
    // 设置新的剪贴板变动
    else if('set' === data.method) {
        obj.stop_watching = true;
        Object.assign(obj.remote, data.info);
        obj.remote.fingerprint = rinfo.fingerprint;
        if(obj.remote.type === 'text') {
            clipboard.writeText(obj.remote.text);
            read_clipboard();
        }
        obj.stop_watching = false;
        return;
    }

}

async function copy_file () {
    // todo 多文件拷贝，直接压缩为一个zip流
    if('file' !== obj.remote.type) {
        // todo 提醒没有文件可供粘贴
        new Notification({ title: 'third 剪贴板', body: '没有文件可供粘贴' }).show();
        return;
    }
    const p = await dialog.showSaveDialog({
        defaultPath: path.join(
            app.getPath('downloads'),
            obj.remote.file.name
        )
    });
    if(p.canceled) return;

    let file_stream = null;

    try {
        file_stream = await engine.rpc.invoke(obj.remote.fingerprint, 'third.sync.clipboard', {
            method: 'get',
            path  : obj.remote.file.path,
        });
    }
    catch(e) {
        new Notification({ title: '文件拷贝错误', body: e.message }).show();
    }
    // todo 取消拷贝
    // todo 展示进度
    file_stream.pipe(fs.createWriteStream(p.filePath));
    file_stream.on('error', (e)=>{
        new Notification({ title: '文件拷贝错误', body: e.message }).show();
    });
    file_stream.on('end', ()=>{
        new Notification({ title: '文件拷贝完成', body: p.filePath }).show();
    });
}

function init () {
    watch_clipboard();
    engine.rpc.regist('third.sync.clipboard', recv);
    globalShortcut.register('CommandOrControl+Shift+V', copy_file);
    log.info('[clipboard.init] 剪贴板同步模块初始化完成');
}

module.exports = {
    init,
};