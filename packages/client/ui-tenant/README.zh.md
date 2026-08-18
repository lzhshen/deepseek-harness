# @deepseek-ai/dsh-client-ui-tenant

[English](README.md) | 中文

Web 多租户身份切换插件。浏览器半把一个浮动的"当前用户"胶囊注册为框架声明的 `shell.overlay` 列表插槽的 `tenant-switcher` 条目；node 半为空（多租户身份是宿主 `@deepseek-ai/dsh-tenant` 服务的职责）。胶囊经 `tenant.list` 读取模拟身份组与当前用户，经 `tenant.select` 切换，然后重新拉取会话列表，使其只显示新用户的会话。

切换是纯加性呈现：它挂进框架而不改 layout、sidebar、conversation 任何插件，身份组/当前用户事实走宿主网关提供的 `tenant.*` wire。未组合宿主 tenant 服务时，两个方法都答 `internal`，胶囊停在空态。

同一插件再加两个加性 `shell.overlay` 条目："绑定我的沙箱"动作驱动当前用户的池化沙箱并回显其沙箱 id 与文件（设计 V2），以及一个只读池水位面板轮询 `tenant.poolStats` 呈现 warm/bound/idle/reclaiming 与累计回收计数（设计 V3）。

## Model Experience

无；当前用户切换是浏览器侧身份呈现，没有任何内容进入模型请求。

#### KV Cache effect

无；本包既未组装也未发送任何 provider 请求。

## 已知局限与延后工作

- **模拟且进程级身份**——切换选的是单个宿主进程上的用户，而非按请求的认证身份。生产用 SSO 注入头替换身份组；胶囊的 `load`/`select` 接口设计上可免改切换。
- **整表重拉而非就地分组**——切换会重拉整个会话基线，而非在行内重新分组。按用户分组的列表延后到列表契约端到端携带归属 `userId` 列之后。
