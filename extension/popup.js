async function loadFillTargets(profileName) {
  const select = document.getElementById('fillTarget');
  select.innerHTML = '<option value="">自动匹配</option>';
  const data = await chrome.storage.local.get(['profileVersions','profiles','activeVersion']);
  const versions = data.profileVersions || {};
  const name = profileName || data.activeVersion || Object.keys(versions)[0] || 'default';
  // 兼容旧格式
  let profile = versions[name] || (data.profiles && data.profiles[name]);
  if (!profile) return;
  const add = (value, text) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = text;
    select.appendChild(opt);
  };
  (profile.experience||[]).forEach((exp, i) =>
    add(`请填写第${i+1}段工作经历：${exp.company}，职位：${exp.title}`, `工作 ${i+1}：${exp.company}`)
  );
  (profile.projects||[]).forEach((proj, i) =>
    add(`请填写第${i+1}个项目：${proj.name}`, `项目 ${i+1}：${proj.name}`)
  );
  (profile.education||[]).forEach((edu, i) =>
    add(`请填写第${i+1}段教育经历：${edu.school}`, `教育 ${i+1}：${edu.school}`)
  );
}

async function loadProfiles() {
  const profileSelect = document.getElementById('profileSelect');
  const errorEl = document.getElementById('profileError');
  const btn = document.getElementById('scanBtn');
  const data = await chrome.storage.local.get(['profileVersions','profiles','activeVersion']);
  const versions = data.profileVersions || {};
  // 兼容旧格式 profiles
  const names = Object.keys(versions).length ? Object.keys(versions) : Object.keys(data.profiles || {});
  if (!names.length) { errorEl.style.display = 'block'; return; }
  const active = data.activeVersion || names[0];
  profileSelect.innerHTML = '';
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name;
    if (name === active) opt.selected = true;
    profileSelect.appendChild(opt);
  });
  btn.disabled = false;
  await loadFillTargets(active);
}

document.getElementById('profileSelect').addEventListener('change', e => loadFillTargets(e.target.value));
document.getElementById('settingsLink').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('settingsLink2')?.addEventListener('click', () => chrome.runtime.openOptionsPage());

loadProfiles();

document.getElementById('scanBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const btn = document.getElementById('scanBtn');
  const fill_hint = document.getElementById('fillTarget').value;
  const profile_name = document.getElementById('profileSelect').value;
  btn.disabled = true;
  status.textContent = '扫描字段中...';
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  chrome.tabs.sendMessage(tab.id, {type: 'SCAN_FIELDS', fill_hint, profile_name}, response => {
    if (chrome.runtime.lastError) {
      status.textContent = '错误：' + chrome.runtime.lastError.message;
      btn.disabled = false; return;
    }
    const count = response?.fields?.length ?? 0;
    status.textContent = `发现 ${count} 个字段，匹配中…`;
    setTimeout(() => { status.textContent = '填写完成，请检查高亮字段后提交。'; btn.disabled = false; }, 15000);
  });
});

document.getElementById('extractBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const btn = document.getElementById('extractBtn');
  btn.disabled = true;
  status.textContent = '正在提取页面信息...';
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  chrome.tabs.sendMessage(tab.id, {type: 'EXTRACT_FILLED_FIELDS'}, response => {
    if (chrome.runtime.lastError) {
      status.textContent = '错误：' + chrome.runtime.lastError.message;
      btn.disabled = false; return;
    }
    const count = response?.filledFields?.length ?? 0;
    if (count === 0) {
      status.textContent = '未找到已填写的字段';
      btn.disabled = false; return;
    }
    status.textContent = `找到 ${count} 个已填字段，解析中…`;
    setTimeout(() => { btn.disabled = false; }, 20000);
  });
});
