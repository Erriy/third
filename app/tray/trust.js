const {clipboard, dialog} = require('electron');
const engine = require('../../lib');

function remove (name, fingerprint) {
    return {
        label: '移除',
        click () {
            const message = '确定要移除此信任设备吗？';
            const detail = `
            ===设备名===
            ${name}
            ===keyid===
            ${fingerprint.slice(24).replace(/(.{4})/g, '$1 ')}
            ===指纹===
            ${fingerprint.slice(0, 20).replace(/(.{4})/g, '$1 ')}
            ${fingerprint.slice(20).replace(/(.{4})/g, '$1 ')}
            `;
            dialog.showMessageBox({
                title    : '防误触确认',
                message,
                detail,
                buttons  : ['确定', '取消'],
                defaultId: 1,
            }).then(async _=>{
                if(_.response !== 0) return;
                await engine.trust.remove(fingerprint);
            });
        }
    };
}

function clipboard_config (fingerprint, config) {
    return {
        label  : '剪贴板',
        submenu: [
            {
                label  : '接收',
                type   : 'checkbox',
                checked: config.clipboard.recv,
                async click (o) {
                    config.clipboard.recv = !config.clipboard.recv;
                    o.checked = config.clipboard.recv;
                    await engine.trust.set(fingerprint, config);
                }
            },
            {
                type   : 'checkbox',
                label  : '发送',
                checked: config.clipboard.send,
                async click (o) {
                    config.clipboard.send = !config.clipboard.send;
                    o.checked = config.clipboard.send;
                    await engine.trust.set(fingerprint, config);
                }
            }
        ]
    };
}

async function trust () {
    return [{
        label  : '信任设备',
        submenu: (await engine.trust.list()).map(d=>{
            const name = d.config.name;
            return {
                label  : name,
                submenu: [
                    {
                        label: d.fingerprint.slice(24),
                        click () {
                            clipboard.writeText(d.fingerprint.slice(24));
                        }
                    },
                    {
                        type: 'separator'
                    },
                    {
                        label  : '同步配置',
                        enabled: false,
                    },
                    clipboard_config(d.fingerprint, d.config),
                    {
                        type: 'separator'
                    },
                    remove(name, d.fingerprint),
                ]
            };
        })
    }];
}

module.exports = trust;