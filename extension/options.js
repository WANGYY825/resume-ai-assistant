'use strict';

const EMPTY_PROFILE = {
  basic: {name:'',phone:'',email:'',dob:'',gender:'',id_number:'',location:'',address:''},
  job_pref: {type:'',city:'',salary:'',available:'',status:''},
  education: [], experience: [], projects: [],
  skills: {skills:'',languages:'',awards:'',software:'',self_intro:''},
  custom: {}
};

// ── 旧格式迁移 ──
function migrateOldProfile(old) {
  const c = old.contact || {};
  return {
    basic: {name:old.name||'',phone:c.phone||'',email:c.email||'',location:c.location||'',linkedin:c.linkedin||'',github:c.github||'',dob:'',gender:'',id_number:'',address:''},
    job_pref: {type:'',city:'',salary:'',available:'',status:''},
    education: (old.education||[]).map(e=>({school:e.school||'',degree:e.degree||'',major:e.major||'',start:e.start_date||'',end:e.end_date||'',gpa:''})),
    experience: (old.experience||[]).map(e=>({company:e.company||'',title:e.title||'',start:e.start_date||'',end:e.end_date||'',description:e.description||''})),
    projects: (old.projects||[]).map(p=>({name:p.name||'',description:p.description||'',tech:Array.isArray(p.technologies)?p.technologies.join(', '):(p.technologies||''),start:'',end:''})),
    skills: {skills:Array.isArray(old.skills)?old.skills.join(', '):(old.skills||''),languages:'',awards:'',software:'',self_intro:''},
    custom: {}
  };
}

// ── 版本管理 ──
let activeVersion = 'default';

async function getVersions() {
  const data = await chrome.storage.local.get(['profileVersions','profileData','profiles','activeVersion']);
  let versions = data.profileVersions || {};
  // 迁移旧 profileData 格式
  if (!Object.keys(versions).length) {
    if (data.profileData) versions['default'] = data.profileData;
    else if (data.profiles) {
      Object.entries(data.profiles).forEach(([k,v]) => { versions[k] = migrateOldProfile(v); });
    }
    if (Object.keys(versions).length) await chrome.storage.local.set({profileVersions: versions});
  }
  activeVersion = data.activeVersion || Object.keys(versions)[0] || 'default';
  return versions;
}

async function loadProfile() {
  const versions = await getVersions();
  const raw = versions[activeVersion];
  const m = JSON.parse(JSON.stringify(EMPTY_PROFILE));
  if (raw) {
    ['basic','job_pref','skills'].forEach(k => { if(raw[k]) Object.assign(m[k], raw[k]); });
    ['education','experience','projects'].forEach(k => { if(raw[k]) m[k] = raw[k]; });
    if (raw.custom) m.custom = raw.custom;
  }
  return m;
}

async function saveProfile(d) {
  const {profileVersions={}} = await chrome.storage.local.get('profileVersions');
  profileVersions[activeVersion] = d;
  await chrome.storage.local.set({profileVersions, activeVersion});
}

async function initVersions() {
  const versions = await getVersions();
  const sel = document.getElementById('versionSelect');
  sel.innerHTML = Object.keys(versions).map(k =>
    `<option value="${k}"${k===activeVersion?' selected':''}>${k}</option>`
  ).join('') || '<option value="default">默认</option>';
}

document.getElementById('versionSelect').addEventListener('change', async e => {
  activeVersion = e.target.value;
  await chrome.storage.local.set({activeVersion});
  renderSection(currentSection);
});

document.getElementById('newVersionBtn').addEventListener('click', async () => {
  const name = prompt('新版本名称（如：国央企、互联网）:');
  if (!name?.trim()) return;
  const {profileVersions={}} = await chrome.storage.local.get('profileVersions');
  if (!profileVersions[name]) profileVersions[name] = JSON.parse(JSON.stringify(EMPTY_PROFILE));
  activeVersion = name;
  await chrome.storage.local.set({profileVersions, activeVersion});
  await initVersions();
  renderSection(currentSection);
});

document.getElementById('delVersionBtn').addEventListener('click', async () => {
  if (!confirm(`确认删除版本「${activeVersion}」？`)) return;
  const {profileVersions={}} = await chrome.storage.local.get('profileVersions');
  delete profileVersions[activeVersion];
  const remaining = Object.keys(profileVersions);
  if (!remaining.length) profileVersions['default'] = JSON.parse(JSON.stringify(EMPTY_PROFILE));
  activeVersion = Object.keys(profileVersions)[0];
  await chrome.storage.local.set({profileVersions, activeVersion});
  await initVersions();
  renderSection(currentSection);
});

async function getConfig() {
  const {apiKey='',baseUrl=''} = await chrome.storage.local.get(['apiKey','baseUrl']);
  return {apiKey, base:(baseUrl||'https://api.anthropic.com').replace(/\/v1\/?$/,'')};
}
async function callClaude(system, content, maxTokens=4096) {
  const {apiKey,base} = await getConfig();
  if (!apiKey) throw new Error('未设置 API Key，请先点右上角 ⚙ API 设置');
  const res = await fetch(`${base}/v1/messages`, {
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apiKey,
      'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body: JSON.stringify({model:'claude-sonnet-5',max_tokens:maxTokens,system,
      messages:[{role:'user',content}]})
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

const SECTIONS=[
  {id:'basic',label:'基本信息'},{id:'job_pref',label:'求职意向'},
  {id:'education',label:'教育经历'},{id:'experience',label:'工作/实习经历'},
  {id:'projects',label:'项目经历'},{id:'skills',label:'技能与特长'},
  {id:'custom',label:'自定义字段'}
];

let currentSection='basic';

function renderNav(activeId) {
  document.getElementById('nav').innerHTML = SECTIONS.map(s =>
    `<div class="nav-item${s.id===activeId?' active':''}" data-section="${s.id}">${s.label}</div>`
  ).join('');
}
function switchTab(id) { currentSection=id; renderNav(id); renderSection(id); }

function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
function field(key,label,val='',type='text',opts=null){
  if(type==='select'&&opts){
    const o=opts.map(x=>`<option value="${esc(x)}"${val===x?' selected':''}>${esc(x)}</option>`).join('');
    return `<div class="field"><label>${label}</label><select data-key="${key}"><option value="">请选择</option>${o}</select></div>`;
  }
  if(type==='textarea')
    return `<div class="field"><label>${label}</label><textarea data-key="${key}" rows="3">${esc(val)}</textarea></div>`;
  return `<div class="field"><label>${label}</label><input type="${type}" data-key="${key}" value="${esc(val)}"/></div>`;
}
const savebar = `<div class="save-bar"><button class="btn-save" data-action="save-flat">保存</button><span id="smsg" class="save-msg"></span></div>`;

async function saveFlat() {
  const p=await loadProfile();
  document.querySelectorAll('[data-key]').forEach(el=>{p[currentSection][el.dataset.key]=el.value;});
  await saveProfile(p);
  const m=document.getElementById('smsg'); if(m){m.textContent='✓ 已保存';setTimeout(()=>m.textContent='',2000);}
}

async function renderSection(id) {
  const p=await loadProfile(); const main=document.getElementById('main');
  if(id==='basic'){const b=p.basic; main.innerHTML=`<div class="section active"><div class="section-title">基本信息</div><div class="section-sub">姓名、联系方式等基础个人信息</div><div class="field-grid">${field('name','姓名',b.name)}${field('gender','性别',b.gender,'select',['男','女','其他'])}${field('phone','手机号',b.phone)}${field('email','邮箱',b.email,'email')}${field('dob','出生日期',b.dob)}${field('id_number','证件号码',b.id_number)}${field('location','所在城市',b.location)}${field('address','详细地址',b.address)}</div>${savebar}</div>`;}
  else if(id==='job_pref'){const j=p.job_pref; main.innerHTML=`<div class="section active"><div class="section-title">求职意向</div><div class="section-sub">期望类型、城市、薪资等</div><div class="field-grid">${field('type','求职类型',j.type,'select',['校园招聘','社会招聘','实习'])}${field('city','意向城市',j.city)}${field('salary','期望薪资',j.salary)}${field('available','到岗时间',j.available)}${field('status','求职状态',j.status,'select',['积极求职','随时到岗','考虑机会','暂不考虑'])}</div>${savebar}</div>`;}
  else if(id==='skills'){const s=p.skills; main.innerHTML=`<div class="section active"><div class="section-title">技能与特长</div><div class="section-sub">技术栈、语言、荣誉、自我评价</div><div class="field-grid full">${field('skills','技能/技术栈',s.skills,'textarea')}${field('languages','语言能力',s.languages,'textarea')}${field('software','熟用软件',s.software,'textarea')}${field('awards','获奖情况',s.awards,'textarea')}${field('self_intro','自我评价',s.self_intro,'textarea')}</div>${savebar}</div>`;}
  else if(['education','experience','projects'].includes(id)) renderList(id,p[id]);
  else if(id==='custom') renderCustom(p.custom);
}

const LIST_CFG={
  education:{title:'教育经历',sub:'学校、学历、专业等',fields:[{k:'school',l:'学校'},{k:'degree',l:'学历'},{k:'major',l:'专业'},{k:'start',l:'入学时间'},{k:'end',l:'毕业时间'},{k:'gpa',l:'GPA/排名'}],getTitle:i=>i.school||'新记录',getSub:i=>[i.degree,i.major,i.start&&i.end?`${i.start}–${i.end}`:''].filter(Boolean).join(' · ')},
  experience:{title:'工作/实习经历',sub:'公司、职位、工作内容等',fields:[{k:'company',l:'公司'},{k:'title',l:'职位'},{k:'start',l:'开始时间'},{k:'end',l:'结束时间'},{k:'description',l:'工作内容',type:'textarea'}],getTitle:i=>i.company||'新记录',getSub:i=>[i.title,i.start&&i.end?`${i.start}–${i.end}`:''].filter(Boolean).join(' · ')},
  projects:{title:'项目经历',sub:'项目名称、描述、技术栈等',fields:[{k:'name',l:'项目名称'},{k:'start',l:'开始'},{k:'end',l:'结束'},{k:'description',l:'描述',type:'textarea'},{k:'tech',l:'技术栈'}],getTitle:i=>i.name||'新项目',getSub:i=>i.tech||''}
};

function renderList(section, items) {
  const cfg=LIST_CFG[section];
  const cards=items.map((item,idx)=>{
    const bodyFields=cfg.fields.map(f=>field(`${section}[${idx}].${f.k}`,f.l,item[f.k]||'',f.type||'text')).join('');
    return `<div class="card"><div class="card-head" data-action="toggle-card" data-idx="${idx}"><div><div class="card-title">${esc(cfg.getTitle(item))}</div><div class="card-sub">${esc(cfg.getSub(item))}</div></div><div class="card-actions"><button class="btn-icon del" data-action="delete-item" data-section="${section}" data-idx="${idx}">删除</button></div></div><div class="card-body" id="card-${idx}"><div class="field-grid">${bodyFields}</div><div class="save-bar"><button class="btn-save" data-action="save-item" data-section="${section}" data-idx="${idx}">保存此条</button><span id="lmsg-${idx}" class="save-msg"></span></div></div></div>`;
  }).join('');
  document.getElementById('main').innerHTML=`<div class="section active"><div class="section-title">${cfg.title}</div><div class="section-sub">${cfg.sub}</div><div class="list-header"><span></span><button class="btn-add" data-action="add-item" data-section="${section}">+ 添加</button></div>${cards||'<p style="color:#aaa;font-size:13px;padding:20px 0">暂无记录，点击右上角添加</p>'}</div>`;
}

async function addListItem(section){const p=await loadProfile();p[section].push({});await saveProfile(p);renderSection(section);}
async function deleteListItem(section,idx){if(!confirm('确认删除？'))return;const p=await loadProfile();p[section].splice(idx,1);await saveProfile(p);renderSection(section);}
async function saveListItem(section,idx,msgEl){
  const p=await loadProfile();
  document.querySelectorAll(`[data-key^="${section}[${idx}]."]`).forEach(el=>{p[section][idx][el.dataset.key.replace(`${section}[${idx}].`,'')]=el.value;});
  await saveProfile(p);
  if(msgEl){msgEl.textContent='✓ 已保存';setTimeout(()=>msgEl.textContent='',2000);}
  renderList(section,p[section]);
}

function renderCustom(custom){
  const rows=Object.entries(custom).map(([k,v],i)=>
    `<div class="custom-row" id="crow-${i}"><input type="text" placeholder="字段名" value="${esc(k)}" class="ckey" data-idx="${i}"/><input type="text" placeholder="字段值" value="${esc(v)}" class="cval" data-idx="${i}"/><button class="btn-row-del" data-action="delete-custom" data-idx="${i}">删除</button></div>`
  ).join('');
  document.getElementById('main').innerHTML=`<div class="section active"><div class="section-title">自定义字段</div><div class="section-sub">添加任意键值对，如：政治面貌、户籍、期望薪资等</div><div id="custom-rows">${rows}</div><button class="btn-add" data-action="add-custom" style="margin-top:8px">+ 添加字段</button><div class="save-bar" style="margin-top:16px"><button class="btn-save" data-action="save-custom">保存</button><span id="smsg" class="save-msg"></span></div></div>`;
}
function addCustomRow(){const c=document.getElementById('custom-rows'),i=c.children.length,row=document.createElement('div');row.className='custom-row';row.id=`crow-${i}`;row.innerHTML=`<input type="text" placeholder="字段名" class="ckey" data-idx="${i}"/><input type="text" placeholder="字段值" class="cval" data-idx="${i}"/><button class="btn-row-del" data-action="delete-custom" data-idx="${i}">删除</button>`;c.appendChild(row);}
function deleteCustomRow(idx){document.getElementById(`crow-${idx}`)?.remove();}
async function saveCustom(){const p=await loadProfile();p.custom={};document.querySelectorAll('.custom-row').forEach(r=>{const k=r.querySelector('.ckey')?.value.trim(),v=r.querySelector('.cval')?.value.trim();if(k)p.custom[k]=v||'';});await saveProfile(p);const m=document.getElementById('smsg');if(m){m.textContent='✓ 已保存';setTimeout(()=>m.textContent='',2000);}}

// ── 粘贴解析 ──
document.getElementById('parseBtn').addEventListener('click',()=>{document.getElementById('parseModal').classList.add('open');document.getElementById('parseSt').textContent='';});
document.getElementById('parseCancelBtn').addEventListener('click',()=>document.getElementById('parseModal').classList.remove('open'));
document.getElementById('parseConfirmBtn').addEventListener('click',async()=>{
  const text=document.getElementById('parseText').value.trim(),st=document.getElementById('parseSt');
  if(!text)return; st.textContent='解析中…';
  try{
    const res=await callClaude('从文本中提取个人信息，以JSON格式返回，包含：basic(name/phone/email/dob/gender/id_number/location)、job_pref(type/city/salary/available)、education[]、experience[]、projects[]、skills(skills/languages/awards/software/self_intro)。只输出JSON。',text);
    const raw=res.content.find(b=>b.type==='text')?.text||'';
    const m=raw.match(/\{[\s\S]*\}/); if(!m)throw new Error('未提取到数据');
    const parsed=JSON.parse(m[0]); const p=await loadProfile();
    ['basic','job_pref','skills'].forEach(k=>{if(parsed[k])Object.assign(p[k],parsed[k]);});
    ['education','experience','projects'].forEach(k=>{if(parsed[k]?.length)p[k]=[...p[k],...parsed[k]];});
    await saveProfile(p); st.textContent='✓ 解析成功，已合并到信息库';
    document.getElementById('parseText').value='';
    setTimeout(()=>{document.getElementById('parseModal').classList.remove('open');renderSection(currentSection);},1500);
  }catch(e){st.textContent='❌ '+e.message;}
});

// ── API设置 ──
document.getElementById('apiBtn').addEventListener('click',async()=>{
  const {apiKey='',baseUrl=''}=await chrome.storage.local.get(['apiKey','baseUrl']);
  document.getElementById('apiKey').value=apiKey; document.getElementById('baseUrl').value=baseUrl;
  document.getElementById('apiModal').classList.add('open');
});
document.getElementById('apiCancelBtn').addEventListener('click',()=>document.getElementById('apiModal').classList.remove('open'));
document.getElementById('apiSaveBtn').addEventListener('click',async()=>{
  await chrome.storage.local.set({apiKey:document.getElementById('apiKey').value.trim(),baseUrl:document.getElementById('baseUrl').value.trim()});
  document.getElementById('apiModal').classList.remove('open');
});

// ── 事件委托（替代所有 onclick="" 属性）──
document.getElementById('nav').addEventListener('click',e=>{
  const item=e.target.closest('[data-section]'); if(item)switchTab(item.dataset.section);
});
document.getElementById('main').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-action]'); if(!btn)return;
  e.stopPropagation();
  const {action,section,idx:idxStr}=btn.dataset; const idx=parseInt(idxStr??'-1');
  if(action==='save-flat') await saveFlat();
  else if(action==='add-item') await addListItem(section);
  else if(action==='delete-item') await deleteListItem(section,idx);
  else if(action==='save-item') await saveListItem(section,idx,document.getElementById(`lmsg-${idx}`));
  else if(action==='toggle-card'){const cb=document.getElementById(`card-${idx}`);if(cb)cb.classList.toggle('open');}
  else if(action==='add-custom') addCustomRow();
  else if(action==='save-custom') await saveCustom();
  else if(action==='delete-custom') deleteCustomRow(idx);
});

// ── 初始化 ──
initVersions().then(() => {
  renderNav('basic');
  renderSection('basic');
});
