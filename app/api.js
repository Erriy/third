const {
    ipcMain,
} = require('electron');
const fs = require('fs');
const path=require('path');

function regist_api_modules(modules_path) {
    fs.readdirSync(modules_path).forEach((file)=>{
        if(file.endsWith('.js')) {
            const module_name = file.slice(0, file.length-3);
            const md = require(path.join(modules_path, module_name));
            Object.keys(md)
                .filter(name=>!name.startsWith('_'))
                .map(name=>ipcMain.handle(
                    `${module_name}.${name}`,
                    (event, ... args)=>(md[name](...args, event))
                ));
        }
    });
}

function init() {
    regist_api_modules(path.join(__dirname, 'api'));
}

module.exports = {
    init,
};