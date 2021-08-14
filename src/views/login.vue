<template>
    <a-card>
        <a-input
            v-model="keyid"
            addon-before="0x"
            placeholder="输入要登录的gpg指纹"
            :loading="loading"
            :disabled="disabled"
            @pressEnter="lookup"
        />
        <div style='margin:15px'></div>
        <div>
            <a-button @click='close'>取消</a-button>
            <a-button
                style="float: right"
                type="primary"
                :loading="loading"
                :disabled="disabled"
                @click='lookup'
            >
                确定
            </a-button>
        </div>
    </a-card>
</template>

<script>
export default {
    data() {
        return {
            keyid: '',
            loading:false,
            disabled:false,
        }
    },
    methods: {
        close() {
            // fixme windows 无法关闭
            window.close();
        },
        async login(fpr) {
            try {
                const msg = await this.$api.account.login(fpr) ? '登录成功': '已提交登录请求';
                await this.$api.dialog.notify({message: msg});
                this.close();
            }
            catch(e) {
                this.$api.dialog.notify({message: '登录失败'});
            }
        },
        async lookup() {
            if(this.disabled || this.loading) return;
            this.disabled = true;
            this.loading = true;
            try {
                const fpr = await this.$api.account.lookup(this.keyid);
                if(!fpr) {
                    await this.$api.dialog.notify({message: "找不到指纹，请确认keyid输入正确"});
                }
                const r = await this.$api.dialog.yes_or_no({
                    title: '确认指纹',
                    message: fpr.replace(/(.{4})/g, '$1 '),
                });
                if(r) {
                    await this.login(fpr);
                }
            }
            finally {
                this.loading = false;
                this.disabled = false;
            }
        }
    },
    mounted() {
    },
    beforeCreate () {
        document.querySelector('body').setAttribute('style', 'background-color:rgb(255, 255, 255, 0)');
    },
}
</script>

<style>
</style>