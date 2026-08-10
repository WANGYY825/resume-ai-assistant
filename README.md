# AI 简历自动填写助手

一个 Chrome 浏览器插件，通过 AI 自动识别招聘页面的表单字段，并将你的个人信息自动填写进去，最终由你人工确认后提交。

## 功能特点

- **个人信息库**：管理多份简历版本，涵盖基本信息、求职意向、教育/工作/项目经历、技能、自定义字段
- **AI 自动填写**：调用 Claude API 语义匹配表单字段，智能将信息填写到对应位置
- **粘贴文本解析**：粘贴任意简历文本，AI 自动提取并存入信息库
- **版本管理**：支持多版本（如国央企、互联网、外企），投递不同岗位时灵活切换
- **指定填写段落**：工作经历/项目经历可指定填第几段，避免重复填写
- **完全本地运行**：数据存储在浏览器本地，不上传任何服务器

## 项目结构

```
resume-ai-assistant/
├── extension/              # Chrome 插件（主体）
│   ├── manifest.json       # 插件配置 (MV3)
│   ├── background.js       # Service Worker，调用 Claude API 匹配字段
│   ├── content.js          # 注入页面，扫描表单字段 + 自动填写
│   ├── popup.html/js       # 插件弹窗 UI
│   ├── options.html/js     # 个人信息库管理页面
│   └── lib/                # 本地依赖（pdf.js、mammoth.js）
└── backend/                # FastAPI 后端（可选，用于命令行上传简历）
    ├── main.py
    ├── llm_client.py
    ├── resume_parser.py
    ├── schemas.py
    └── requirements.txt
```

## 快速开始

### 1. 安装 Chrome 插件

1. 下载或克隆本仓库
2. 打开 `chrome://extensions`，开启右上角**开发者模式**
3. 点击**加载已解压的扩展程序**，选择 `extension/` 目录

### 2. 配置 API Key

1. 右键插件图标 → **选项**
2. 点击右上角 **⚙ API 设置**
3. 填入 [Anthropic API Key](https://console.anthropic.com/)，保存

### 3. 录入个人信息

在插件选项页：

- **手动填写**：逐 Tab 填写基本信息、求职意向、教育/工作/项目经历等
- **粘贴解析**：点击「✦ 粘贴文本解析」，粘贴简历文字，AI 自动提取填入

### 4. 自动填写招聘表单

1. 打开招聘平台，进入需要填写的表单页面
2. 点击浏览器右上角的插件图标
3. 选择要使用的**简历版本**和**指定填写段落**（可选）
4. 点击「**扫描并自动填写**」
5. 等待 5–15 秒，检查高亮字段后手动提交

## 技术栈

| 模块 | 技术 |
|------|------|
| 浏览器插件 | Chrome Extension Manifest V3 |
| AI 模型 | Claude Sonnet 5 / Haiku 4.5 (Anthropic) |
| PDF 解析 | pdf.js |
| Word 解析 | mammoth.js |
| 本地存储 | chrome.storage.local |
| 可选后端 | Python + FastAPI |

## 注意事项

- 个人信息（证件号、手机等）存储在本地浏览器，不会上传
- API Key 存储在 `chrome.storage.local`，请勿分享给他人
- 验证码、密码类字段 AI 会自动跳过，不会填写
- 填写结果需人工确认后再提交，最终决策权在你
