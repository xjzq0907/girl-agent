# 安全

token 存放在 `data/<slug>/config.json` 中，仅本地保存。`data/` 已在 `.gitignore` 中。

如果不小心提交了 —— 立刻去源头撤销（BotFather 的 `/revoke`、userbot 去 my.telegram.org、LLM 密钥去对应服务商后台），然后用 `git filter-repo` 或 BFG 清理 git 历史、force-push、发布新版本。

发现漏洞 —— 在 issue 上加 `security` 标签，或私下联系。POC 请在修复后再公开。

Userbot 模式通过 MTProto 使用你的真实账号运行，存在被 Telegram 封号的风险。
