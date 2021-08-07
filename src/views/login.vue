<template>
    <div style="margin-bottom: 16px">
        <a-input
            v-model="keyid"
            addon-before="0x"
            placeholder="输入要登录的gpg指纹"
            :loading="loading"
            :disabled="disabled"
            @pressEnter="lookup"
        />
    </div>
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
        async login(fpr) {
            try {
                const msg = await this.$api.account.login(fpr) ? '登录成功': '已提交登录请求';
                this.$message.success(msg);
            }
            catch(e) {
                this.$message.error('登录失败');
            }
        },
        lookup() {
            if(this.disabled || this.loading) return;
            this.disabled = true;
            this.loading = true;
            this.$api.account.lookup(this.keyid)
            .then(fprs=>{
                if(fprs.length < 0) {
                    return this.$message.warning("找不到指纹，请确认keyid输入正确");
                }
                this.$confirm({
                    title: '请确认指纹正确',
                    width: '500px',
                    content: fprs[0].replace(/(.{4})/g, '$1 '),
                    onOk: async ()=>{
                        await this.login(fprs[0]);
                    },
                    onCancel() {},
                });
            })
            .finally(() => {
                this.loading = false;
                this.disabled = false;
            })

        }
    },
    mounted() {
    }
}
</script>

<style>

</style>