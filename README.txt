RIGLAB 装机研究所

启动
1. 安装依赖：python -m pip install -r requirements.txt
2. 新数据库按顺序执行 sql/database.sql、sql/auth.sql；已有数据库请先确认表结构，勿重复初始化。
3. 连接参数通过 PGHOST、PGPORT、PGDATABASE、PGUSER、PGPASSWORD 设置。
4. 创建管理员：python auth.py；重置密码：python auth.py --reset-password 用户名。
5. 启动网站：python run.py，然后打开 http://127.0.0.1:8000/。
   Uvicorn：python -m uvicorn main:app --reload --loop app.core.database:selector_loop_factory

目录说明
app/main.py              应用组装、启动检查和静态网页挂载
app/core/                公共数据库连接、事件循环和项目路径
app/auth/                登录注册、会话、用户管理、密码工具和管理员命令
app/ai/                  AI 服务、请求结构、配置与装机校验规则
app/parts/               配件列表接口和共享配件查询

dist/*.html              网页入口，原访问地址保持不变
dist/assets/builder/     装机前台脚本和样式
dist/assets/admin/       配件管理后台脚本和样式
dist/assets/auth/        公共登录客户端和用户管理脚本
dist/assets/ai/          AI 推荐界面、服务配置脚本和样式
dist/assets/shared/      配件数据、浏览器存储和访问记录

sql/                     数据库初始化脚本
docs/                    登录与 AI 助手使用说明
tests/                   模型响应和临时数据库集成检查
.local/                  本机 AI 配置（不提交）

根目录 main.py、auth.py 为兼容入口，业务代码统一维护在 app 中。
新增同类功能请放入对应模块；多个功能共用的配件查询放入 app/parts/service.py。
数据库仍使用原连接参数，本机 AI 配置仍读取 .local/ai-settings.json。

验证
python tests/check_structure.py
python tests/check_ai_response.py
数据库集成检查 tests/check_auth.py、tests/check_ai.py 仅允许连接
RIGLAB_TEST_DATABASE=1 且 PGPORT=55439 的临时测试实例，不能对业务库运行。

当前边界
登录、用户管理、配件读取和 AI 校验使用服务器与 PostgreSQL。
收藏、配件后台编辑和访问记录仍使用浏览器存储。
兼容检查覆盖插槽、内存代际和电源余量；价格与性能说明需在购买前核实。
