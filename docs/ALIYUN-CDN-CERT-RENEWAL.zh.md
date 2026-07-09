# 阿里云 CDN 域名证书续期操作记录

本文记录 `hdupdate.myseek.fun` 的 HTTPS 证书到期后续期流程。

当前域名链路：

- 业务域名：`hdupdate.myseek.fun`
- DNS 托管：Cloudflare
- 业务解析：Cloudflare 中的 `hdupdate` CNAME，目标为 `hdupdate.myseek.fun.w.kunlunaq.com`
- 证书申请：阿里云数字证书管理服务，个人测试证书
- 证书部署：阿里云 CDN 加速域名的 HTTPS 配置

## 注意事项

- 不要修改或删除 Cloudflare 中已有的业务 CNAME：`hdupdate -> hdupdate.myseek.fun.w.kunlunaq.com`。
- 阿里云个人测试证书有效期约 3 个月。到期后不是延长原证书，而是重新申请一张新证书并替换到 CDN。
- Cloudflare 中的证书验证记录只用于 CA 验证域名所有权，不负责网站访问。
- CDN 使用新证书后需要等待几分钟同步到边缘节点。

## 1. 申请新证书

1. 登录阿里云控制台。
2. 进入 **数字证书管理服务**。
3. 进入 **SSL 证书管理 V2.0**。
4. 购买或领取 **个人测试证书**。
5. 发起证书申请，填写：
   - **证书绑定域名**：`hdupdate.myseek.fun`
   - **域名验证方式**：手动 DNS 验证
   - **联系人**：选择已有联系人
   - **所在地**：如实选择
6. 提交申请，进入域名验证步骤。

## 2. 在 Cloudflare 添加验证记录

阿里云会给出一条 DNS 验证记录，通常为 `TXT`，也可能为 `CNAME`。

1. 登录 Cloudflare。
2. 进入站点 `myseek.fun`。
3. 打开 **DNS > Records**。
4. 点击 **Add record**，新增一条记录。
5. 按阿里云页面给出的内容填写：
   - **Type**：阿里云给 `TXT` 就选 `TXT`；给 `CNAME` 就选 `CNAME`
   - **Name**：填写阿里云给的主机记录，例如 `_dnsauth.hdupdate`
   - **Content / Target**：填写阿里云给的记录值
   - **TTL**：选择 `Auto`
   - 如果是 `CNAME`，代理状态选择 **DNS only**，不要开启橙色云
6. 保存记录。
7. 回到阿里云证书申请页面，点击验证或继续提交审核。

填写示例：

| 阿里云字段 | Cloudflare 字段 | 示例 |
|------------|-----------------|------|
| 记录类型 | Type | `TXT` |
| 主机记录 | Name | `_dnsauth.hdupdate` |
| 记录值 | Content | 以阿里云页面本次给出的值为准 |
| TTL | TTL | `Auto` |

Cloudflare 会自动把 `_dnsauth.hdupdate` 解析为完整域名 `_dnsauth.hdupdate.myseek.fun`，一般不要在 Name 中重复填写 `.myseek.fun`。

## 3. 等待证书签发

验证成功后，阿里云会进入 CA 审核和签发流程。个人测试证书通常几分钟到十几分钟内完成。

状态判断：

- **审核中 / 待签发**：继续等待。
- **已签发 / 签发成功**：进入 CDN 换证书步骤。
- **验证失败**：回 Cloudflare 检查验证记录的 Type、Name、Content 是否与阿里云页面一致。

## 4. 在阿里云 CDN 替换 HTTPS 证书

证书签发后，去 CDN 控制台替换证书。

1. 进入 **阿里云 CDN 控制台**。
2. 打开 **域名管理**。
3. 找到加速域名 `hdupdate.myseek.fun`。
4. 点击 **管理**。
5. 打开 **HTTPS 配置**。
6. 在 **HTTPS 证书** 区域点击 **修改配置**。
7. 保持 HTTPS 证书为开启状态。
8. 证书来源选择 **云盾证书 / SSL 证书中心 / 云盾 SSL 证书管理** 这类选项。
9. 从证书列表中选择新签发的 `hdupdate.myseek.fun` 证书。
10. 保存配置。

如果 CDN 页面无法从证书中心选择新证书，才需要手动下载证书：

- 下载类型选择 **Nginx**。
- 证书格式为 `pem/key`。
- 将 `.pem` 内容填入证书公钥或证书内容。
- 将 `.key` 内容填入私钥。

## 5. 验证生效

保存 CDN 配置后等待几分钟，再验证：

1. 打开 `https://hdupdate.myseek.fun`。
2. 点击浏览器地址栏的小锁。
3. 查看证书详情。
4. 确认证书域名包含 `hdupdate.myseek.fun`。
5. 确认证书到期时间已经变成新证书的到期时间。

也可以在 PowerShell 中检查：

```powershell
curl.exe -Iv https://hdupdate.myseek.fun
```

如果浏览器仍显示旧证书，先等待 CDN 同步；如果超过 30 分钟仍未变化，回到 CDN 的 HTTPS 配置确认已保存为新证书。

## 下次续期快速清单

1. 阿里云数字证书管理服务中重新申请 `hdupdate.myseek.fun` 个人测试证书。
2. 在 Cloudflare 的 `myseek.fun` DNS 中新增阿里云给出的 `_dnsauth.hdupdate` 验证记录。
3. 阿里云验证成功并等待证书签发。
4. 到阿里云 CDN 的 `hdupdate.myseek.fun` 加速域名里修改 HTTPS 证书。
5. 保存后访问网站，确认浏览器展示的是新证书有效期。
