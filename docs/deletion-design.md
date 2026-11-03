# 删除功能设计(贴纸页 / 原图 / 生成图 / 账户)

- 状态:**设计稿,不含实现**。实现分成后续 PR,本文件只供 Huibo 审核。
- 依据:只读审计(仓库 HEAD `15ea959`,2026-11-03)和 PR1(`feat/pr1-privacy-and-api-hardening`)引入的私有桶 `uploads_private`。
- 涉及的迁移、环境变量、Vercel Cron、service role 密钥:**都需要 Huibo 确认后才能执行或配置**。

---

## 1. 现状(为什么要做)

| 数据 | 位置 | 现在能否删除 |
|---|---|---|
| 贴纸页配置 | `public.sheets` 行(只追加,每次自动保存都 insert 新行) | **不能**。RLS 只有 select / insert 策略,也没有 `grant delete`(`supabase/migrations/20261030120000_create_sheets.sql:18-33`) |
| 原图(PR1 之前) | 公开桶 `uploads/<uuid>.<ext>`,不带用户 ID | **不能**,也无法按用户定位 |
| 原图(PR1 之后) | 私有桶 `uploads_private/{auth.uid()}/{uuid}.{ext}` | PR1 的存储策略已允许本人删除自己目录下的文件,但前端还没有入口 |
| AI 生成图 | fal CDN(`*.fal.media`),URL 存在 `sheets.items[].imageUrl` / `generated_url` | **不能**。我们没有保存 fal 的 `request_id`,无法调用 fal 删除接口 |
| fal 请求记录 | fal 后台 Request History | PR1 起新请求带 `X-Fal-Store-IO: 0`,不再保存;PR1 之前的请求默认保存 90 天 |
| 配额记录 | `public.generation_events`(PR1) | 用户删除时随 `auth.users` 级联删除;函数也会自动清理 2 天前的记录 |
| 浏览器 | `localStorage` 的 `sheetly-style:<url>`、Supabase auth cookie | 用户可在浏览器清除;账户删除后前端应主动清理 |

---

## 2. 功能范围

1. **删除单个贴纸页**:`/sheets` 每张卡片加 "Delete",确认后删除该行;若该行引用的原图 / 生成图不再被本人其他贴纸页引用,一并删除。
2. **删除原图**:编辑器里 "×" 目前只移除页面状态。改为:已登录且照片尚未被任何已保存贴纸页引用时,同时删除 `uploads_private` 中的对象;已被引用则只移出当前编辑器(避免破坏已保存的贴纸页)。
3. **删除生成图**:跟随贴纸页或原图一起删除;单独删除某个风格结果的入口暂不做(价值低)。
4. **删除账户**:`/account`(新页面)或 `/sheets` 底部 "Delete my account and data",二次确认(输入 `DELETE`)后执行完整删除流程(见 §4)。

---

## 3. 数据模型改动(迁移只在实现 PR 中编写,不在本 PR)

### 3.1 `sheets` 增加删除策略

```sql
create policy "Users can delete their sheets"
  on public.sheets for delete to authenticated
  using (auth.uid() = user_id);
grant delete on public.sheets to authenticated;
```

- 不加 update 策略(自动保存去重是另一项工作,见审计 R8)。
- 前端删除用 `supabase.from("sheets").delete().eq("id", id)`,RLS 保证只能删本人行。

### 3.2 记录 fal `request_id`,才能删除生成图

- `/api/generate` 在 `fal.subscribe` 返回后保存 `result.requestId`。两种方案:
  - A(推荐):新表 `public.generations (id uuid pk, user_id uuid references auth.users on delete cascade, fal_request_id text not null, output_url text not null, source_path text, style text, created_at timestamptz default now())`,只允许本人 select;写入通过 SECURITY DEFINER 函数或服务端。
  - B:写进 `sheets.items[]` 的每个元素(`falRequestId`)。缺点:同一生成图可能被多行引用,删除时难以判断。
- 更根本的做法(审计 R6):生成后把图片**转存到自家私有桶** `uploads_private/{uid}/generated/{uuid}.png`,fal 端立即调用删除接口或用 `X-Fal-Object-Lifecycle-Preference` 设置短过期。这样删除只需要处理自家存储。建议和删除功能同一阶段做。

### 3.3 引用关系

- 删除原图 / 生成图前,需要判断 "本人其他 sheets 是否还引用它"。在 `items` jsonb 上查询:
  `select 1 from sheets where user_id = auth.uid() and (items @> '[{"photoUrl": "<ref>"}]' or photo_url = '<ref>' or source_image_url = '<ref>')`。
- 数据量小(每用户几十到几百行),先不建索引;需要时加 `gin (items jsonb_path_ops)`。

---

## 4. 账户删除流程(服务端)

需要新增服务端专用的 `SUPABASE_SECRET_KEY`(service role),放在 `lib/supabase/admin.ts`(`import "server-only"`),**只在测试项目先配置**,由 Huibo 在 Vercel 设置。`FAL_KEY` 需要具备 `models:requests:write` 和 `assets:write` 权限才能删 fal 输出(见 §5)。

`DELETE /api/account`(需要登录,另加最近 10 分钟内重新验证邮箱 OTP 或重新登录,防止会话被盗时一键删号):

1. 用用户会话确认身份,取得 `uid`。
2. **订单检查**(见 §6):若有未完成订单(已付款未发货),拒绝删除并提示联系客服;否则继续。
3. **列出并删除存储对象**:用 service role 调用 Storage API `list("{uid}/", { limit: 1000 })` 分页,再 `remove([...paths])`。
   - 必须走 Storage API,**不能**直接 `delete from storage.objects`(那只删元数据,文件仍在)。
   - Supabase 不允许删除仍拥有 Storage 对象的用户(以测试项目实测为准),所以这一步要在删除用户之前完成。
4. **删除 fal 输出**:对 `generations` 中该用户的每个 `fal_request_id` 调用 `DELETE https://api.fal.ai/v1/models/requests/{request_id}/payloads`(带 `Idempotency-Key`)。失败的记入 `deletion_jobs` 重试队列,不阻塞账户删除。
5. **订单匿名化**(若已有订单表):把 `orders.user_id` 置空或改为占位、清除邮箱以外的个人信息;法定需保留的票据字段保留(见 §6)。
6. **删除 auth 用户**:`supabase.auth.admin.deleteUser(uid)`。`sheets`、`generation_events`、`generations` 通过 `on delete cascade` 一起删除。
7. 前端:清除 `localStorage` 中所有 `sheetly-style:*`,调用 `signOut()`,跳转到确认页。
8. 记录审计日志(不含个人数据):`deletion_log (id, deleted_at, uid_hash, storage_objects, fal_requests, status)`,用于证明已执行删除请求。

失败处理:步骤 3–6 任一失败,记录 `deletion_jobs(uid, step, attempts, last_error)`,由 Cron 重试;向用户显示 "我们已收到删除请求,会在 N 天内完成"。

---

## 5. fal 侧说明

- 官方文档(2026-11-03 查阅):
  - 请求记录默认保存 90 天,`X-Fal-Store-IO: 0` 可关闭(PR1 已加)。https://fal.ai/docs/documentation/model-apis/media-expiration
  - `DELETE /v1/models/requests/{request_id}/payloads` 删除请求的输入输出记录和**输出** CDN 文件;**输入** CDN 文件不删(我们给 fal 的是自家签名 URL,不经过 fal CDN 上传,所以没有输入文件)。需要 `models:requests:write`、`assets:write` 权限。https://fal.ai/docs/platform-apis/v1/models/requests/payloads
  - `X-Fal-Object-Lifecycle-Preference: {"expiration_duration_seconds": N}` 设置输出文件过期;过期即永久删除。
- PR1 之前生成的图片:我们没有 `request_id`,**无法逐个删除**。可选:在 fal 后台按时间范围批量处理,或请 fal 支持协助;隐私政策中需如实说明。
- Black Forest Labs 侧的保留政策:未核实(审计 §4b),由 Sales / 法务确认。

---

## 6. 级联与订单保留的冲突

- `sheets.user_id` 是 `on delete cascade`;将来的 `orders` 如果 `references sheets(id) on delete restrict`,删除用户或贴纸页会失败。
- 设计(与审计 D3/D4 一致):
  - `orders.sheet_id ... on delete set null`,下单时把贴纸页配置冻结为 `orders.sheet_snapshot jsonb`,印刷文件复制到私有桶 `print-files/{order_id}/`。
  - `orders.user_id ... on delete restrict`,账户删除流程先**匿名化**订单(§4 第 5 步)再删用户。
  - 印刷文件(含用户照片)在订单完成 + 售后期(建议 60 天,待定)后删除;法定需保留的是发票 / 交易记录,不是照片本身。具体保留期由 Sales / 会计确认。
- 删除单个贴纸页时不受订单影响(订单用快照)。

---

## 7. 保留期与清理任务(Cron)

需要新增 `vercel.json` 的 `crons` 和受 `CRON_SECRET` 保护的路由(都需 Huibo 在 Vercel 配置):

| 任务 | 频率 | 规则(建议值,待 Huibo 确认) |
|---|---|---|
| 孤儿原图 | 每天 | `uploads_private` 中 7 天前上传、且没有任何 sheets 引用的对象 → 删除 |
| 旧公开桶 `uploads` | 一次性 + 每天 | 先把仍被 sheets 引用的对象复制到 `uploads_private/{user_id}/`(按 sheets 行的 user_id)并改写引用;其余超过 30 天的对象删除;完成后把桶设为 private(见 `supabase/manual/lock_legacy_uploads_bucket.sql`,PR1) |
| 删除任务重试 | 每小时 | 处理 `deletion_jobs`,超过 5 次失败通知管理员 |
| 未完成订单的印刷文件 | 每天 | 订单取消 / 过期后 7 天删除 |

上线清理任务后,才能在页面上写 "Uploaded photos are stored for up to N days"(审计 §4f)。

---

## 8. GDPR 时限

- 第 17 条 "被遗忘权":收到请求后 "without undue delay" 删除。
- 第 12(3) 条:**一个月内**答复并执行,复杂情况可再延长两个月,但须在第一个月内告知用户。
- 自助删除应即时完成主体部分(数据库行、自家存储);fal 等处理者侧的删除在重试队列中完成,目标 **7 天内**,最迟不超过一个月。
- 隐私政策需说明:删除范围、处理者(Supabase、fal.ai → Black Forest Labs、Vercel)、备份中的数据会在备份轮换周期后消失(Supabase 备份周期需查项目套餐)。
- 法律结论以 Sales / 法务为准,本节只是技术侧的时限目标。

---

## 9. 验证方式(实现 PR 中执行,只在测试项目 / 本地)

1. **RLS**:本地 Supabase(或 PGlite 加 auth/storage 桩)中,用户 A 删除用户 B 的 sheet → 0 行;A 删除自己的 → 1 行。
2. **存储**:A 不能 list / remove B 目录;账户删除后 `list("{uid}/")` 为空。
3. **账户删除端到端**(测试项目):创建测试用户 → 上传 2 张照片 → 生成 1 张 AI 图 → 保存 2 个 sheet → 删除账户 → 检查:`auth.users`、`sheets`、`generation_events`、`generations` 无该 uid;`uploads_private/{uid}/` 为空;fal 删除接口返回 `exception: null`;再次访问 fal 输出 URL 返回 404/403。
4. **订单冲突**:有未完成订单时删除账户 → 被拒绝;已完成订单 → 订单保留但 `user_id` 已匿名化。
5. **幂等**:同一删除请求重复执行不报错。
6. **前端**:删除后 `/sheets` 列表即时更新;`localStorage` 中无 `sheetly-style:*`。

---

## 10. 实现顺序建议

1. `sheets` delete 策略 + `/sheets` 删除按钮(最小,马上解决 "不能删贴纸页")。
2. 生成图转存自家私有桶 + 记录 `fal_request_id`(同时解决 R6)。
3. 编辑器 "×" 联动删除原图。
4. `DELETE /api/account` + service role(需 Huibo 配置密钥)。
5. 清理 Cron + 旧公开桶迁移。
6. 隐私政策页面(内容由 Sales / 法务提供)。

## 11. 需要 Huibo 确认

- 是否接受新增 service role 密钥(仅服务端,先配在测试项目)。
- `FAL_KEY` 是否换成具备删除权限的 key(或单独一把仅用于删除的 key)。
- 保留期数值:孤儿原图 7 天、旧公开桶 30 天、印刷文件售后期 60 天(建议值)。
- 账户删除是否要求重新验证(推荐要求)。
- Vercel Cron 与 `CRON_SECRET` 配置。
