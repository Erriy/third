const {exec, execSync} = require('child_process');

exec('git show :package.json', (error, stdout, stderr) => {
    const version = `v${JSON.parse(stdout).version}`;
    exec(`git tag ${version}`, (error, stdout, stderr) =>{
        if(error) {
            return;
        }
        execSync(
            'git push && git push --tags',
            {stdio: [process.stdin, process.stdout, process.stderr]}
        );
    });
});
