const MATCH_SYSTEM = `你是求职表单填写助手。根据简历信息严格匹配并填写字段。

核心原则：宁可少填，绝不填错。字段用途不明确时直接跳过。

字段规则：
- 推荐码/邀请码/referral code → 跳过（简历中无此信息）
- 姓名/名字 → 只填真实姓名，不填邮箱或手机
- 手机/电话 → 只填11位手机号
- 邮箱/email → 只填邮箱地址
- 语言能力/外语 → 只填语言技能（如英语、雅思分数），不填项目描述
- 熟用软件/工具 → 只填软件名称（Word/Excel/Python等）
- 所获荣誉/奖项 → 只填竞赛奖项，不填技术栈
- 爱好特长 → 填兴趣爱好，不要填编程技能
- 技能/技术能力 → 填编程语言和技术框架

通用规则：
1. 只有字段语义与简历内容完全对应时才填写
2. 项目/实习内容根据用户指定的具体条目填写，不混淆不同条目
3. 分点列表改写为流畅段落，不保留·或-符号
4. 参考 maxlength 控制长度
5. value 只输出纯文本，不加 markdown`;

const MATCH_TOOLS = [{
  name: 'fill_form_fields', description: '根据简历信息为表单字段提供填写值',
  input_schema: {type: 'object', properties: {matches: {type: 'array', items: {
    type: 'object',
    properties: {selector: {type: 'string'}, value: {type: 'string'}},
    required: ['selector', 'value']
  }}}, required: ['matches']}
}];

async function callClaude(system, userContent, tools, toolName, maxTokens = 2048) {
  const {apiKey = '', baseUrl = ''} = await chrome.storage.local.get(['apiKey', 'baseUrl']);
  if (!apiKey) throw new Error('未设置 API Key，请在插件设置页填写');
  const base = (baseUrl || 'https://api.anthropic.com').replace(/\/v1\/?$/, '');
  const body = {model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, system,
    messages: [{role: 'user', content: userContent}]};
  if (tools) {body.tools = tools; body.tool_choice = {type: 'tool', name: toolName};}
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'x-api-key': apiKey,
      'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'},
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

function coerce(data) {
  for (const [k, v] of Object.entries(data)) {
    if (typeof v === 'string') {
      const s = v.trimStart();
      if (s[0] === '[' || s[0] === '{') {try {data[k] = JSON.parse(v);} catch {}}
    }
  }
  return data;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== 'FIELDS_SCANNED') return true;

  const tabId = sender.tab?.id;
  const {fields = [], fill_hint = '', profile_name = 'default'} = msg;

  chrome.storage.local.get(['profileVersions','profileData','profiles','activeVersion']).then(async (store) => {
    const versions = store.profileVersions || {};
    const active = store.activeVersion || profile_name || 'default';
    let profile = versions[active] || versions[profile_name] || Object.values(versions)[0];
    // 向后兼容旧格式
    if (!profile && store.profileData) profile = store.profileData;
    if (!profile && store.profiles) profile = store.profiles[profile_name] || Object.values(store.profiles)[0];
    if (!profile) {
      console.error('[BG] 未找到简历，请先在设置页上传');
      if (tabId) chrome.tabs.sendMessage(tabId, {type: 'FILL_ERROR', message: '未找到简历，请先在插件设置页上传'});
      return;
    }

    const fieldsDesc = fields.map(f =>
      `- selector=${JSON.stringify(f.selector)} label=${JSON.stringify(f.label)} name=${JSON.stringify(f.name)} placeholder=${JSON.stringify(f.placeholder)} type=${f.type} maxlength=${f.maxlength || ''}`
    ).join('\n');
    const hint = fill_hint ? `\n\n用户指定：${fill_hint}` : '';

    try {
      const res = await callClaude(
        MATCH_SYSTEM + hint,
        `简历：\n${JSON.stringify(profile, null, 2)}\n\n字段：\n${fieldsDesc}\n\n请填写合适的字段。`,
        MATCH_TOOLS, 'fill_form_fields'
      );
      const tb = res.content.find(b => b.type === 'tool_use');
      if (!tb) return;
      const raw = coerce(tb.input);
      const matches = Array.isArray(raw.matches) ? raw.matches : [];
      console.log('[BG] 匹配结果:', matches);
      if (tabId) chrome.tabs.sendMessage(tabId, {type: 'FILL_FIELDS', matches});
    } catch (e) {
      console.error('[BG] 匹配失败:', e.message);
    }
  });

  sendResponse({status: 'ok'});
  return true;
});
