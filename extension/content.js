// Content Script — 扫描表单字段 + 自动填写

function getLabel(input) {
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) return label.innerText.trim();
  }
  const wrapping = input.closest('label');
  if (wrapping) return wrapping.innerText.replace(input.value, '').trim();
  if (input.getAttribute('aria-label')) return input.getAttribute('aria-label');
  // 向上最多4层寻找 label 类元素（处理 React 表单组件）
  let el = input.parentElement;
  for (let i = 0; i < 4; i++) {
    if (!el) break;
    const lbl = el.querySelector('label, [class*="label"], [class*="title"], [class*="Label"]');
    if (lbl && lbl !== input && !lbl.contains(input)) {
      const t = lbl.innerText.trim();
      if (t && t.length < 40) return t;
    }
    el = el.parentElement;
  }
  const prev = input.previousElementSibling;
  if (prev) return prev.innerText.trim();
  return '';
}

function extractFilledFields() {
  const selectors =
    "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=password]), textarea, select";
  const elements = Array.from(document.querySelectorAll(selectors)).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });

  const filledFields = [];
  elements.forEach((el) => {
    let value = "";
    let displayValue = "";

    if (el.tagName === "SELECT") {
      const selected = el.options[el.selectedIndex];
      if (selected && selected.value && selected.value !== "" && selected.text !== "请选择") {
        value = selected.value;
        displayValue = selected.text.trim();
      }
    } else if (el.type === "checkbox") {
      if (el.checked) {
        value = "true";
        displayValue = "已勾选";
      }
    } else if (el.type === "radio") {
      if (el.checked) {
        value = el.value;
        displayValue = el.value;
      }
    } else {
      value = el.value?.trim() || "";
      displayValue = value;
    }

    if (value && value !== "") {
      filledFields.push({
        tag: el.tagName.toLowerCase(),
        type: el.type || "",
        name: el.name || "",
        label: getLabel(el),
        value: value,
        displayValue: displayValue,
        placeholder: el.placeholder || "",
      });
    }
  });

  console.log(`[AI填写助手] 提取到 ${filledFields.length} 个已填字段:`, filledFields);
  return filledFields;
}

function scanFields() {
  const selectors =
    "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select";
  const elements = Array.from(document.querySelectorAll(selectors)).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });

  const fields = elements.map((el, idx) => {
    el.setAttribute("data-ai-idx", idx);
    return {
      index: idx,
      tag: el.tagName.toLowerCase(),
      type: el.type || "",
      id: el.id || "",
      name: el.name || "",
      placeholder: el.placeholder || "",
      label: getLabel(el),
      autocomplete: el.autocomplete || "",
      selector: `[data-ai-idx="${idx}"]`,
      options: el.tagName === "SELECT"
        ? Array.from(el.options).map((o) => ({ value: o.value, text: o.text.trim() }))
        : [],
      maxlength: el.maxLength > 0 ? el.maxLength : "",
    };
  });

  console.log(`[AI填写助手] 扫描到 ${fields.length} 个字段:`, fields);
  return fields;
}

function fillField(el, value) {
  if (!value) return;
  const tag = el.tagName;

  if (tag === "SELECT") {
    // 按文本匹配 option（LLM 返回的是展示文字，不是 value）
    const match = Array.from(el.options).find(
      (o) =>
        o.text.trim() === value ||
        o.text.trim().includes(value) ||
        value.includes(o.text.trim())
    );
    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      console.warn("[AI填写助手] SELECT 无匹配项:", value, Array.from(el.options).map(o => o.text));
    }
  } else if (tag === "INPUT" && el.type === "checkbox") {
    el.checked = value === "true" || value === true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    // React/Vue 受控组件：通过原生 setter 绕过合成事件系统
    const proto =
      tag === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  el.style.outline = "2px solid #f9a825";
  el.style.backgroundColor = "#fffde7";
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SCAN_FIELDS") {
    const fields = scanFields();
    chrome.runtime.sendMessage({ type: "FIELDS_SCANNED", fields, fill_hint: message.fill_hint || "", profile_name: message.profile_name || "default" });
    sendResponse({ fields });
  }

  if (message.type === "EXTRACT_FILLED_FIELDS") {
    const filledFields = extractFilledFields();
    chrome.runtime.sendMessage({ type: "FILLED_FIELDS_EXTRACTED", filledFields });
    sendResponse({ filledFields });
  }

  if (message.type === "FILL_FIELDS") {
    let filled = 0;
    for (const { selector, value } of message.matches) {
      try {
        const el = document.querySelector(selector);
        if (el) {
          fillField(el, value);
          filled++;
        }
      } catch (e) {
        console.warn("[AI填写助手] 无法填写字段:", selector, e);
      }
    }
    console.log(`[AI填写助手] 已填写 ${filled} 个字段`);
    sendResponse({ filled });
  }

  if (message.type === "EXTRACTION_RESULT") {
    alert(`提取成功！\n\n已保存到简历版本: ${message.versionName}\n\n提取字段数: ${message.extractedCount}\n\n请在插件设置页查看和编辑。`);
  }

  return true;
});
