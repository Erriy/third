const {ipcRenderer} = window.require('electron');

const third = new Proxy({},  {
    get (target, key) {
        if(undefined === target[key]) {
            target[key] = new Proxy({__module_name__: key},  {
                get (target, key) {
                    if(undefined === target[key]) {
                        target[key] = (...args)=>(ipcRenderer.invoke(
                            `${target.__module_name__}.${key}`, ...args
                        ));
                    }
                    return target[key];
                }
            });
        }
        return target[key];
    }
});