const {clipboard, dialog} = require('electron');
const engine = require('../../lib');

function trust_device (name, fingerprint) {
    const message = '确定信任此设备？确定后默认会向其同步剪贴板等私密数据，请确认指纹正确';
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
        await engine.trust.set(fingerprint, {
            name,
            clipboard: {
                recv: true,
                send: true,
            }
        });
    });
}

async function local () {
    const thisfpr = engine.runtime.key.getFingerprint().toUpperCase();
    const trusted_list = (await engine.trust.list()).map(d=>(d.fingerprint));
    return [{
        label  : '本地设备',
        submenu: (await engine.kns.local()).map(r=>{
            // 本机设备不显示
            if(thisfpr === r.fingerprint) return;
            // 不显示已信任设备
            if(-1 !== trusted_list.indexOf(r.fingerprint)) return;

            const o = JSON.parse(r.text);
            const keyid = r.fingerprint.slice(24);

            return {
                label  : `${o.name}[${keyid}]`,
                submenu: [
                    {
                        label: '信任',
                        click: ()=>{
                            trust_device(o.name, r.fingerprint);
                        }
                    },
                    {
                        label: '复制',
                        click: ()=>{
                            clipboard.writeText(keyid);
                        }
                    }
                ]
            };
        }).filter(i=>(i))
    }];
}

module.exports = local;