/* ==========================================================================
   AetherAI Studio - Main Controller & Canvas Neural Net Visualization
   ========================================================================== */

import { aetherApi } from './api.js';
import { compileMarkdown, chatHistory } from './chat.js';
import { getPresetById, PromptLibrary, updatePromptLibraryLanguage } from './prompts.js';
import { translations } from './translations.js';

// Global Abort Controller for Chat Streams
let currentAbortController = null;
let isGenerating = false;

// DOM Elements
const elements = {
  neuralCanvas: document.getElementById('neural-canvas'),
  sidebar: document.querySelector('.sidebar'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  controlPanel: document.querySelector('.control-panel'),
  panelToggle: document.getElementById('panel-toggle'),
  historyContainer: document.getElementById('history-container'),
  btnNewChat: document.getElementById('btn-new-chat'),
  btnClearAll: document.getElementById('btn-clear-all'),
  
  // Chat DOMs
  chatMessages: document.getElementById('chat-messages'),
  chatWelcome: document.getElementById('chat-welcome'),
  chatTextarea: document.getElementById('chat-textarea'),
  btnSend: document.getElementById('btn-send'),
  btnStop: document.getElementById('btn-stop'),
  btnExport: document.getElementById('btn-export'),
  langSelect: document.getElementById('select-lang'),
  suggestionsContainer: document.getElementById('suggestions-container'),
  activeModelSelect: document.getElementById('active-model-select'),
  activePresetLabelDisplay: document.getElementById('active-preset-label'),
  connectionStatusPill: document.getElementById('connection-status-pill'),
  
  // Settings Panel Config DOMs
  providerSelect: document.getElementById('select-provider'),
  modelSelect: document.getElementById('select-model'),
  ollamaUrlInput: document.getElementById('input-ollama-url'),
  customUrlInput: document.getElementById('input-custom-url'),
  apiKeyInput: document.getElementById('input-api-key'),
  
  // Parameters DOMs
  tempSlider: document.getElementById('slider-temp'),
  tempValue: document.getElementById('val-temp'),
  tokensSlider: document.getElementById('slider-tokens'),
  tokensValue: document.getElementById('val-tokens'),
  topPSlider: document.getElementById('slider-topp'),
  topPValue: document.getElementById('val-topp'),
  topKSlider: document.getElementById('slider-topk'),
  topKValue: document.getElementById('val-topk'),
  repeatPenaltySlider: document.getElementById('slider-penalty'),
  repeatPenaltyValue: document.getElementById('val-penalty'),
  systemPromptArea: document.getElementById('textarea-system-prompt'),
  presetsGrid: document.getElementById('presets-grid'),
  
  // Metrics Monitor DOMs
  metricTps: document.getElementById('metric-tps'),
  metricTokens: document.getElementById('metric-tokens'),
  metricTime: document.getElementById('metric-time')
};

function startWaitingState(contentDiv) {
  const lang = localStorage.getItem('aether_lang') || 'en';
  const phrases = {
    "zh-TW": ["請稍等...", "等一下下...", "思考中..."],
    "en": ["Please wait...", "Just one click...", "Thinking..."],
    "ja": ["お待ちください...", "ちょっと待ってください...", "思考中..."]
  };
  const activePhrases = phrases[lang] || phrases["en"];
  let index = 0;
  contentDiv.innerHTML = `
    <div class="assistant-waiting-container" style="display: inline-flex; align-items: center; gap: 4px;">
      <span class="assistant-waiting-text">${activePhrases[0]}</span>
      <span class="typing-cursor"></span>
    </div>
  `;
  const intervalId = setInterval(() => {
    const textEl = contentDiv.querySelector('.assistant-waiting-text');
    if (textEl) {
      index = (index + 1) % activePhrases.length;
      textEl.innerText = activePhrases[index];
    } else {
      clearInterval(intervalId);
    }
  }, 2000);
  return intervalId;
}

/* ==========================================================================
   Language Translation & i18n Engine
   ========================================================================== */
function updateLanguage(lang) {
  // 1. Persist selected language
  localStorage.setItem('aether_lang', lang);
  
  // 2. Set browser root language attribute
  document.documentElement.lang = lang;
  
  // 3. Update Prompts Library in-place elements
  updatePromptLibraryLanguage(lang);

  // 4. Translate all text elements carrying [data-i18n]
  const dict = translations[lang] || translations['zh-TW'];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      // If the node contains tags (e.g. status dot inside pill), replace only the text node!
      // This is extremely safe and keeps existing SVG icons/elements intact!
      let replaced = false;
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() !== '') {
          node.nodeValue = dict[key];
          replaced = true;
          break;
        }
      }
      // Fallback: If no text node was matched (e.g. empty element), set innerText
      if (!replaced) {
        el.innerText = dict[key];
      }
    }
  });

  // 5. Translate all placeholders carrying [data-i18n-placeholder]
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (dict[key]) {
      el.setAttribute('placeholder', dict[key]);
    }
  });

  // 6. Re-populate control presets grid
  initPresetsGrid();

  // 7. Re-inject prompt chip suggestions above textarea if welcome is active
  const activeChatId = chatHistory.getActiveChatId();
  if (!activeChatId) {
    // If no active session, get preset from selected grid visual marker
    const selectedPresetId = document.querySelector('.preset-card[style*="border-color"]') ? 
      Array.from(document.querySelectorAll('.preset-card')).findIndex(c => c.style.borderColor !== '') : 'general';
    // Look up ID name of preset
    const presetId = typeof selectedPresetId === 'number' && selectedPresetId >= 0 ? 
      PromptLibrary[selectedPresetId]?.id : 'general';
    
    injectPreset(presetId, true);
  } else {
    // If active session, refresh active preset visual state
    const chat = chatHistory.getChatById(activeChatId);
    if (chat && chat.presetId) {
      injectPreset(chat.presetId, false);
    }
  }

  // 8. Re-render conversation history list
  renderSessionsHistory();
}

/* ==========================================================================
   1. Interactive Neural Network Particle Canvas Animation
   ========================================================================== */
function initNeuralBackground() {
  const canvas = elements.neuralCanvas;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  let animationFrameId;

  // Track resizing
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = (canvas.width = window.innerWidth);
    height = (canvas.height = window.innerHeight);
  });

  const particles = [];
  const particleCount = Math.min(60, Math.floor((width * height) / 25000));
  const connectionDistance = 140;

  // Interactive mouse tracking
  const mouse = { x: null, y: null, radius: 180 };
  window.addEventListener('mousemove', (e) => {
    mouse.x = e.x;
    mouse.y = e.y;
  });
  window.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
  });

  class Particle {
    constructor() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = (Math.random() - 0.5) * 0.45;
      this.vy = (Math.random() - 0.5) * 0.45;
      this.radius = Math.random() * 2 + 1;
      this.color = Math.random() > 0.5 ? '#00f2fe' : '#9b51e0';
    }

    update() {
      // Gentle floating physics
      this.x += this.vx;
      this.y += this.vy;

      // Wall bounce
      if (this.x < 0 || this.x > width) this.vx *= -1;
      if (this.y < 0 || this.y > height) this.vy *= -1;

      // Mouse interactive attraction
      if (mouse.x !== null) {
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const force = (mouse.radius - dist) / mouse.radius;
          this.x -= dx * force * 0.02;
          this.y -= dy * force * 0.02;
        }
      }
    }

    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = this.radius * 2;
      ctx.shadowColor = this.color;
      ctx.fill();
      ctx.shadowBlur = 0; // Reset shadow for lines
    }
  }

  // Populate particles list
  for (let i = 0; i < particleCount; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);

    // Draw connecting synapses lines
    for (let i = 0; i < particles.length; i++) {
      const p1 = particles[i];
      p1.update();
      p1.draw();

      for (let j = i + 1; j < particles.length; j++) {
        const p2 = particles[j];
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < connectionDistance) {
          const alpha = (1 - dist / connectionDistance) * 0.18;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          
          // Gradient between cyan and purple
          const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
          grad.addColorStop(0, p1.color === '#00f2fe' ? `rgba(0, 242, 254, ${alpha})` : `rgba(155, 81, 224, ${alpha})`);
          grad.addColorStop(1, p2.color === '#00f2fe' ? `rgba(0, 242, 254, ${alpha})` : `rgba(155, 81, 224, ${alpha})`);
          
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // Draw lines to mouse pointer
      if (mouse.x !== null) {
        const dx = p1.x - mouse.x;
        const dy = p1.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < mouse.radius) {
          const alpha = (1 - dist / mouse.radius) * 0.12;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(0, 242, 254, ${alpha})`;
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  animate();
}

/* ==========================================================================
   2. UI Settings and Layout Actions
   ========================================================================== */
function setupDrawerCollapsers() {
  // Mobile / Desktop Sidebars toggle action
  elements.sidebarToggle?.addEventListener('click', () => {
    elements.sidebar.classList.toggle('open');
  });

  elements.panelToggle?.addEventListener('click', () => {
    elements.controlPanel.classList.toggle('open');
  });

  // Automatically close sidebar overlay when clicking on chat center in mobile viewports
  elements.chatMessages.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      elements.sidebar.classList.remove('open');
    }
    if (window.innerWidth <= 1024) {
      elements.controlPanel.classList.remove('open');
    }
  });
}

function initSettingsValues() {
  // Sliders visual linking
  elements.tempSlider?.addEventListener('input', (e) => {
    elements.tempValue.innerText = e.target.value;
  });
  elements.tokensSlider?.addEventListener('input', (e) => {
    elements.tokensValue.innerText = e.target.value;
  });
  elements.topPSlider?.addEventListener('input', (e) => {
    elements.topPValue.innerText = e.target.value;
  });
  elements.topKSlider?.addEventListener('input', (e) => {
    elements.topKValue.innerText = e.target.value;
  });
  elements.repeatPenaltySlider?.addEventListener('input', (e) => {
    elements.repeatPenaltyValue.innerText = e.target.value;
  });

  elements.activeModelSelect?.addEventListener('change', () => {
    if (elements.modelSelect) {
      elements.modelSelect.value = elements.activeModelSelect.value;
      elements.modelSelect.dispatchEvent(new Event('change'));
    }
  });

  // Providers UI inputs toggling
  elements.providerSelect?.addEventListener('change', (e) => {
    const provider = e.target.value;
    
    // Hide all custom inputs
    document.getElementById('group-ollama-url').style.display = 'none';
    document.getElementById('group-custom-url').style.display = 'none';
    document.getElementById('group-api-key').style.display = 'none';

    if (provider === 'ollama') {
      document.getElementById('group-ollama-url').style.display = 'flex';
      elements.modelSelect.removeAttribute('disabled');
    } else if (provider === 'openai' || provider === 'gemini') {
      document.getElementById('group-api-key').style.display = 'flex';
    } else if (provider === 'custom') {
      document.getElementById('group-custom-url').style.display = 'flex';
      document.getElementById('group-api-key').style.display = 'flex';
    }

    updateProviderConnection();
  });

  // Config fields change bindings
  const updateConfigFromInputs = () => {
    aetherApi.updateConfig({
      provider: elements.providerSelect.value,
      ollamaUrl: elements.ollamaUrlInput.value,
      customUrl: elements.customUrlInput.value,
      apiKey: elements.apiKeyInput.value,
      modelName: elements.modelSelect.value
    });
  };

  elements.ollamaUrlInput?.addEventListener('input', updateConfigFromInputs);
  elements.customUrlInput?.addEventListener('input', updateConfigFromInputs);
  elements.apiKeyInput?.addEventListener('input', updateConfigFromInputs);
  
  elements.modelSelect?.addEventListener('change', () => {
    updateConfigFromInputs();
    const activeChatId = chatHistory.getActiveChatId();
    if (activeChatId) {
      const chat = chatHistory.getChatById(activeChatId);
      if (chat) {
        chat.model = elements.modelSelect.value;
      }
    }
    updateTopBarModelName();
  });
}

async function updateProviderConnection() {
  const provider = elements.providerSelect.value;
  
  aetherApi.updateConfig({
    provider,
    ollamaUrl: elements.ollamaUrlInput.value,
    customUrl: elements.customUrlInput.value,
    apiKey: elements.apiKeyInput.value
  });

  // Update Status Pill
  elements.connectionStatusPill.className = 'status-pill status-offline';
  elements.connectionStatusPill.querySelector('span:last-child').innerText = '正在連線...';
  
  // Show spinner inside selector
  elements.modelSelect.innerHTML = '<option value="">正在加載模型列表...</option>';

  const previouslySelectedModel = aetherApi.modelName || elements.modelSelect.value;

  try {
    const models = await aetherApi.fetchModels();
    
    // Success
    elements.modelSelect.innerHTML = '';
    models.forEach(model => {
      const opt = document.createElement('option');
      opt.value = model.name;
      opt.innerText = `${model.name} (${model.details})`;
      elements.modelSelect.appendChild(opt);
    });

    // Restore or select first model
    if (models.length > 0) {
      const exists = models.some(m => m.name === previouslySelectedModel);
      let mName = exists ? previouslySelectedModel : models[0].name;
      elements.modelSelect.value = mName;
      aetherApi.updateConfig({ modelName: mName });
    } else {
      aetherApi.updateConfig({ modelName: '' });
    }

    elements.connectionStatusPill.className = 'status-pill status-online';
    elements.connectionStatusPill.querySelector('span:last-child').innerText = '已連線';
  } catch (err) {
    // Graceful error fallback
    elements.connectionStatusPill.className = 'status-pill status-alert';
    elements.connectionStatusPill.querySelector('span:last-child').innerText = '未連線 (離線模擬)';

    // If local Ollama failed, offer simulation models automatically
    elements.modelSelect.innerHTML = `
      <option value="Aether-Neural-9B">Aether-Neural-9B (離線模擬)</option>
      <option value="Aether-Coder-7B">Aether-Coder-7B (離線代碼模擬)</option>
    `;
    
    aetherApi.updateConfig({ 
      provider: 'simulator',
      modelName: 'Aether-Neural-9B'
    });
  }

  updateTopBarModelName();
}

function updateTopBarModelName() {
  const model = aetherApi.modelName || 'Aether-Neural-9B';
  const provider = aetherApi.provider.toUpperCase();
  if (elements.activeModelSelect) {
    elements.activeModelSelect.innerHTML = elements.modelSelect.innerHTML;
    elements.activeModelSelect.value = model;
  }
  document.getElementById('active-model-provider').innerText = provider;
}

/* ==========================================================================
   3. Preset Library & Action Handling (Stubbed)
   ========================================================================== */
let currentPresetId = 'general';
function initPresetsGrid() {}
function injectPreset(presetId, loadPromptIntoTextarea = true) {}

/* ==========================================================================
   4. Chat History / Sessions list UI Binding
   ========================================================================== */
function renderSessionsHistory() {
  const container = elements.historyContainer;
  if (!container) return;

  container.innerHTML = '';
  const chats = chatHistory.getAllChats();
  const activeId = chatHistory.getActiveChatId();

  if (chats.length === 0) {
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 20px;">無歷史對話紀錄</div>';
    return;
  }

  chats.forEach(chat => {
    const item = document.createElement('div');
    item.className = `history-item ${chat.id === activeId ? 'active' : ''}`;
    
    item.innerHTML = `
      <div class="history-title-wrap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span class="history-title">${chat.title}</span>
      </div>
      <button class="history-btn-del" title="刪除對話">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      </button>
    `;

    // Click to switch conversation session
    item.addEventListener('click', (e) => {
      if (e.target.closest('.history-btn-del')) return; // handled below
      switchSession(chat.id);
      
      // Auto close sidebar on mobile after clicking item
      if (window.innerWidth <= 768) {
        elements.sidebar.classList.remove('open');
      }
    });

    // Delete session
    item.querySelector('.history-btn-del').addEventListener('click', (e) => {
      e.stopPropagation();
      const activeLang = localStorage.getItem('aether_lang') || 'zh-TW';
      const delConfirmText = (translations[activeLang] || translations['zh-TW']).confirm_del_chat;
      if (confirm(delConfirmText)) {
        chatHistory.deleteChat(chat.id);
        renderSessionsHistory();
        
        // If active chat was deleted, load new active chat
        const currentActive = chatHistory.getActiveChatId();
        if (currentActive) {
          switchSession(currentActive);
        } else {
          loadNewSessionState();
        }
      }
    });

    container.appendChild(item);
  });
}

function switchSession(chatId) {
  chatHistory.setActiveChatId(chatId);
  renderSessionsHistory();

  const chat = chatHistory.getChatById(chatId);
  if (!chat) return;

  // Clear previous chat items
  elements.chatWelcome.style.display = 'none';
  elements.chatMessages.innerHTML = '';
  
  // Load stored system prompt first
  elements.systemPromptArea.value = chat.systemPrompt || '';
  // Inject preset without overwriting prompt
  injectPreset(chat.presetId || 'general', false);

  // Populate messages
  chat.messages.forEach(msg => {
    appendMessageRowToDOM(msg.role, msg.content);
  });

  // Select correct model in playground selector if matched
  if (chat.model) {
    aetherApi.modelName = chat.model;
    updateTopBarModelName();
  }

  elements.btnExport.removeAttribute('disabled');
  
  // Scroll to bottom
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function loadNewSessionState() {
  chatHistory.setActiveChatId(null);
  elements.chatMessages.innerHTML = '';
  elements.chatWelcome.style.display = 'flex';
  elements.btnExport.setAttribute('disabled', 'true');
  
  // Default inject general preset options
  injectPreset('general');
  renderSessionsHistory();
}

/* ==========================================================================
   5. Message Streaming & Execution
   ========================================================================== */
function appendMessageRowToDOM(role, rawContent) {
  const row = document.createElement('div');
  row.className = `message-row ${role} animate-slide-in`;

  const avatarSVG = role === 'user' 
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 0 1 10 10v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7A10 10 0 0 1 12 2z"/><path d="M12 18v-4"/><path d="M8 10h.01"/><path d="M16 10h.01"/></svg>`;

  row.innerHTML = `
    ${role === 'assistant' ? `<div class="message-avatar">${avatarSVG}</div>` : ''}
    <div class="message-content">
      ${role === 'user' ? `<p>${rawContent.replace(/\n/g, '<br>')}</p>` : compileMarkdown(rawContent)}
    </div>
    ${role === 'user' ? `<div class="message-avatar">${avatarSVG}</div>` : ''}
  `;

  elements.chatMessages.appendChild(row);
  return row;
}

async function handleSendMessage() {
  const prompt = elements.chatTextarea.value.trim();
  if (!prompt || isGenerating) return;

  // Clear inputs and prepare area
  elements.chatTextarea.value = '';
  elements.chatTextarea.style.height = '48px'; // Reset textarea height
  elements.chatWelcome.style.display = 'none';

  // 1. Fetch or create active conversation
  let activeId = chatHistory.getActiveChatId();
  if (!activeId) {
    const newChat = chatHistory.createChat(
      aetherApi.modelName || 'Aether-Neural-9B',
      elements.systemPromptArea.value,
      currentPresetId
    );
    activeId = newChat.id;
    renderSessionsHistory();
  }

  // 2. Save user message to database & DOM
  chatHistory.appendMessage(activeId, 'user', prompt);
  appendMessageRowToDOM('user', prompt);
  
  // Clean prompt chips container once chat starts
  elements.suggestionsContainer.innerHTML = '';
  
  // 3. Create Assistant bubble with typing placeholder inside DOM
  const assistantRow = appendMessageRowToDOM('assistant', '');
  const contentDiv = assistantRow.querySelector('.message-content');
  
  // Start waiting state text cycle animation
  let waitingIntervalId = startWaitingState(contentDiv);
  
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

  // Toggle generation buttons
  setGeneratingState(true);

  // Setup streaming controllers
  currentAbortController = new AbortController();
  let fullStreamText = "";

  // Dynamic system monitor parameters
  const temp = parseFloat(elements.tempSlider.value);
  const maxTokens = parseInt(elements.tokensSlider.value);
  const topP = parseFloat(elements.topPSlider.value);
  const topK = parseInt(elements.topKSlider.value);
  const repeatPenalty = parseFloat(elements.repeatPenaltySlider.value);
  const systemPrompt = elements.systemPromptArea.value;

  const chatLogs = chatHistory.getChatById(activeId).messages;

  // Start Canvas loading pulse
  document.querySelector('.chat-model-avatar').classList.add('ai-core-active');

  try {
    await aetherApi.streamChat(
      chatLogs,
      { temperature: temp, maxTokens, topP, topK, repeatPenalty, systemPrompt },
      (chunkText, stats) => {
        if (waitingIntervalId) {
          clearInterval(waitingIntervalId);
          waitingIntervalId = null;
        }
        // Stream chunk success callback
        fullStreamText += chunkText;
        contentDiv.innerHTML = compileMarkdown(fullStreamText) + '<span class="typing-cursor"></span>';
        
        // Auto scroll to bottom
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

        if (stats) {
          if (elements.metricTps) elements.metricTps.innerText = `${stats.tokensPerSec} t/s`;
          if (elements.metricTokens) elements.metricTokens.innerText = stats.evalCount;
          if (elements.metricTime) elements.metricTime.innerText = `${stats.totalDuration}s`;
        }
      },
      (err) => {
        if (waitingIntervalId) {
          clearInterval(waitingIntervalId);
          waitingIntervalId = null;
        }
        // API stream failure error callback
        console.error('API Stream Exception:', err);
        const errAlert = `
          <div class="status-pill status-alert" style="display: flex; flex-direction: column; align-items: flex-start; padding: 16px; margin-top: 10px; width: 100%; border-radius: var(--border-radius-sm);">
            <div style="font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
              <span class="status-dot" style="background: var(--color-error)"></span>
              <span>連線例外中斷 (Connection Failed)</span>
            </div>
            <div style="font-size: 13px; line-height: 1.5; opacity: 0.8;">
              無法與本機 AI 核心伺服器取得連線。
              <br><br>
              <strong>可能解決辦法：</strong>
              <ul style="margin-left: 16px; margin-top: 6px;">
                <li>請確保本機的 <strong>Ollama</strong> 已經啟動。</li>
                <li>若為網頁 CORS 跨域限制，請在啟動 Ollama 時附帶以下環境變數：<br><code style="background: rgba(0,0,0,0.5); display:block; padding:4px 8px; margin: 4px 0;">OLLAMA_ORIGINS="*" ollama serve</code></li>
                <li>您亦可將右側<b>模型來源</b>切換為「離線模擬」以利立刻體驗流暢的系統界面！</li>
              </ul>
            </div>
          </div>
        `;
        contentDiv.innerHTML = errAlert;
      },
      currentAbortController
    );

    if (waitingIntervalId) {
      clearInterval(waitingIntervalId);
      waitingIntervalId = null;
    }

    // Stream finished successfully. Remove typing cursor indicator
    const cursor = contentDiv.querySelector('.typing-cursor');
    if (cursor) cursor.remove();
    
    // Save Assistant reply to localStorage database
    if (fullStreamText.trim()) {
      chatHistory.appendMessage(activeId, 'assistant', fullStreamText);
      renderSessionsHistory(); // update title rename if needed
    }

  } catch (e) {
    if (waitingIntervalId) {
      clearInterval(waitingIntervalId);
      waitingIntervalId = null;
    }
    console.warn('Chat execution exception:', e);
  } finally {
    if (waitingIntervalId) {
      clearInterval(waitingIntervalId);
      waitingIntervalId = null;
    }
    setGeneratingState(false);
    document.querySelector('.chat-model-avatar').classList.remove('ai-core-active');
  }
}

function setGeneratingState(generating) {
  isGenerating = generating;
  if (generating) {
    elements.btnSend.style.display = 'none';
    elements.btnStop.style.display = 'flex';
    elements.btnStop.removeAttribute('disabled');
  } else {
    elements.btnSend.style.display = 'flex';
    elements.btnStop.style.display = 'none';
    elements.btnStop.setAttribute('disabled', 'true');
  }
}

function handleStopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
    setGeneratingState(false);
    
    // Cleanup active cursor
    const cursor = elements.chatMessages.querySelector('.typing-cursor');
    if (cursor) cursor.remove();
  }
}

/* ==========================================================================
   6. Export Chat Session
   ========================================================================== */
function handleExportChat() {
  const activeId = chatHistory.getActiveChatId();
  if (!activeId) return;

  const chat = chatHistory.getChatById(activeId);
  if (!chat) return;

  // Construct Markdown structure
  let markdown = `# ${chat.title}\n`;
  markdown += `* **模型來源**: ${chat.model}\n`;
  markdown += `* **對話時間**: ${new Date(chat.createdAt).toLocaleString()}\n\n`;
  markdown += `---\n\n`;

  chat.messages.forEach(msg => {
    const roleLabel = msg.role === 'user' ? '🧑 使用者' : '🤖 AetherAI';
    markdown += `### ${roleLabel}\n\n${msg.content}\n\n`;
  });

  // Client side file downloader
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${chat.title.replace(/\s+/g, '_')}_對話紀錄.md`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ==========================================================================
   7. Application Initialization Bootstrap
   ========================================================================== */
function init() {
  // Setup language selector binding
  const savedLang = localStorage.getItem('aether_lang') || 'zh-TW';
  if (elements.langSelect) {
    elements.langSelect.value = savedLang;
    elements.langSelect.addEventListener('change', (e) => {
      updateLanguage(e.target.value);
    });
  }

  initNeuralBackground();
  setupDrawerCollapsers();
  initSettingsValues();
  
  // Translate everything on initial boot
  updateLanguage(savedLang);
  
  // Attempt Ollama Tag list fetching
  updateProviderConnection();

  // Load chat session if stored in storage
  const activeChatId = chatHistory.getActiveChatId();
  if (activeChatId && chatHistory.getChatById(activeChatId)) {
    switchSession(activeChatId);
  } else {
    loadNewSessionState();
  }

  // Textarea input grow auto listener
  elements.chatTextarea?.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });



  // Send bindings
  elements.btnSend?.addEventListener('click', handleSendMessage);
  elements.chatTextarea?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Stop generation action
  elements.btnStop?.addEventListener('click', handleStopGeneration);

  // New Chat session action
  elements.btnNewChat?.addEventListener('click', () => {
    loadNewSessionState();
    // Auto open sidebar on desktop but close on mobile
    if (window.innerWidth <= 768) {
      elements.sidebar.classList.remove('open');
    }
  });

  // Clear all chats database
  elements.btnClearAll?.addEventListener('click', () => {
    const activeLang = localStorage.getItem('aether_lang') || 'zh-TW';
    const clearConfirmText = (translations[activeLang] || translations['zh-TW']).confirm_del_all;
    if (confirm(clearConfirmText)) {
      chatHistory.clearAll();
      loadNewSessionState();
    }
  });

  // Export action
  elements.btnExport?.addEventListener('click', handleExportChat);
  
  // Custom inject general presets in landing widgets
  document.getElementById('preset-welcome-general').addEventListener('click', () => {
    injectPreset('general');
  });
  document.getElementById('preset-welcome-coder').addEventListener('click', () => {
    injectPreset('coder');
  });
  document.getElementById('preset-welcome-uiux').addEventListener('click', () => {
    injectPreset('uiux');
  });
  document.getElementById('preset-welcome-english').addEventListener('click', () => {
    injectPreset('english');
  });
}

// Start application when DOM loaded
window.addEventListener('DOMContentLoaded', init);
