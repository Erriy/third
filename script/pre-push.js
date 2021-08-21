const {exec, execSync} = require('child_process');
const path = require('path');
const fse = require('fs-extra');

exec('git branch --show-current', (error, stdout, stderr)=>{
    if(stdout.replace(/[\r\n]/, '') !== 'main') {
        console.log('[*] 非main分支，不进行版本处理');
        return;
    }

    exec('git show :package.json', (error, stdout, stderr) => {
        const version = `v${JSON.parse(stdout).version}`;
        exec(`git tag ${version}`, (error, stdout, stderr) =>{
            if(error) return;
            console.log('[*] 发现版本变化，推送tag到github');
            execSync(
                'git push --no-verify && git push --tags',
                {stdio: [process.stdin, process.stdout, process.stderr]}
            );
            // 如果家目录下有builder token 则自动构建并推送mac应用，其他架构使用github action release
            const github_token_path = path.join(process.env.HOME || process.env.USERPROFILE, '.electron_builder_github_token');
            if(!fse.existsSync(github_token_path)) return;
            console.log('[*] 开始构建应用');
            const token = fse.readFileSync(github_token_path).toString().replace(/[\r\n]/g, '');
            execSync(
                `GITHUB_TOKEN=${token} npm run build -- -p always`,
                {stdio: [process.stdin, process.stdout, process.stderr]}
            );
        });
    });
});