# {{MODULE_ID}} Module Contract

module_id: {{MODULE_ID}}
module_name: {{MODULE_NAME}}
project_main_session_id: {{PROJECT_MAIN_SESSION_ID}}
ownership_epoch: {{OWNERSHIP_EPOCH}}
project_outline_revision: {{OUTLINE_REVISION}}
project_outline_sha256: {{OUTLINE_SHA256}}
workdir: {{WORKDIR}}
delivery_dir: {{DELIVERY_DIR}}

## 交付物

模块代码只能交付到 `{{DELIVERY_DIR}}`。

## 交付标准

遵循 document → test/RED → code/minimal GREEN → verify/pass。

## 允许写入

{{OWNED_PATHS}}

## 禁止写入

{{FORBIDDEN_PATHS}}

本文件由项目主会话签发。模块会话和任务会话只能读取，不能修改、移动、重命名或删除。
