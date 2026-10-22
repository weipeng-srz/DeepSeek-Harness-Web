# 样式回退验收

本次全面重设计已按用户要求撤回。独立QA在隔离服务上完成 **77/77** 项回归；未继续进行新设计审查。PDF预览响应策略和Escape功能修复保留，用户会话及主服务未被测试修改。

## 验证结果

| 范围 | 结果 | 证据 |
| --- | --- | --- |
| 核心浏览器/API、搜索、草稿、路由、设置、附件、批量失败恢复 | 59/59 | [results](../../../reports/quality/style-rollback/results.json)、[exploration](../../../reports/quality/style-rollback/exploration.json)、[batch](../../../reports/quality/style-rollback/batch.json) |
| Codex模态、正反Tab、Escape叠层、回焦、尺寸切换、减少动态 | 10/10 | [modal.json](../../../reports/quality/style-rollback/modal.json) |
| 真实v17→v18升级、旧缓存清除、API不缓存、离线及在线恢复 | 8/8 | [release.json](../../../reports/quality/style-rollback/release.json) |

升级实测先加载回退前的完整v17页面（app56/codex3/bundle50/CSS3），恢复回退版本文件后，点击旧页面的更新提示，实际进入v18（app57/codex4/bundle51/CSS4）。没有用新HTML安装旧worker代替真实升级。

源码对比确认：基线目录中的8份CSS全部逐字节相同；首页HTML除资源版本号外逐字节相同；`design-system.css`已不存在，页面不带`data-design`。[对比记录](../../../reports/quality/style-rollback/style-source-comparison.json)。PDF功能沿用本轮已通过的真实原生阅读器及安全响应头专项；本次精简回退回归没有将其重新计入77项。

## 首页截图

已实际查看以下四张Chrome截图，确认上一版渐变球、场景卡片和输入区样式恢复；五个场景保留，无文档横向溢出。

- [桌面浅色](../../../reports/quality/style-rollback/home-1440-light.png) · [桌面深色](../../../reports/quality/style-rollback/home-1440-dark.png)
- [手机视口浅色](../../../reports/quality/style-rollback/home-390-light.png) · [手机视口深色](../../../reports/quality/style-rollback/home-390-dark.png)

冻结源码：`/var/folders/dk/8smfqslj1x9035fw9kx777rm0000gn/T/dsh-quality-style-rollback-g0oiRo`。升级基线：`data/quality-backups/apple-redesign-before-rollback/public`。测试使用合成数据与独立端口8804–8806，全部测试进程正常结束。手机截图属于视口模拟，不代表真机软键盘或屏幕阅读器认证。
