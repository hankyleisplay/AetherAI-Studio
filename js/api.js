/* ==========================================================================
   AetherAI Studio - API Connections & Offline Simulation Engine
   ========================================================================== */

import { getPresetById } from './prompts.js';

class AetherAPI {
  constructor() {
    this.provider = 'ollama'; // 'ollama' | 'openai' | 'custom' | 'simulator'
    this.ollamaUrl = 'http://localhost:11434';
    this.customUrl = '';
    this.apiKey = '';
    this.modelName = '';
  }

  updateConfig(config) {
    if (config.provider) this.provider = config.provider;
    if (config.ollamaUrl) this.ollamaUrl = config.ollamaUrl.replace(/\/$/, '');
    if (config.customUrl) this.customUrl = config.customUrl;
    if (config.apiKey) this.apiKey = config.apiKey;
    if (config.modelName) this.modelName = config.modelName;
  }

  /**
   * Fetches the list of models available from the selected provider.
   */
  async fetchModels() {
    if (this.provider === 'ollama') {
      try {
        const response = await fetch(`${this.ollamaUrl}/api/tags`, {
          signal: AbortSignal.timeout(2000) // Fast timeout for responsiveness
        });
        if (!response.ok) throw new Error('Ollama connection error');
        const data = await response.json();
        return data.models.map(m => ({
          name: m.name,
          details: `${m.details?.parameter_size || 'N/A'} · ${Math.round(m.size / (1024*1024*1024)*10)/10} GB`
        }));
      } catch (err) {
        console.warn('Ollama not reachable, falling back to simulator models list.', err);
        throw err;
      }
    } else if (this.provider === 'openai') {
      return [
        { name: 'gpt-4o', details: 'OpenAI Flagship' },
        { name: 'gpt-4-turbo', details: 'OpenAI Power' },
        { name: 'gpt-3.5-turbo', details: 'OpenAI Fast' }
      ];
    } else if (this.provider === 'gemini') {
      return [
        { name: 'gemini-1.5-flash', details: 'Google Fast' },
        { name: 'gemini-1.5-pro', details: 'Google Creative' },
        { name: 'gemini-2.0-flash-exp', details: 'Google Next-Gen' }
      ];
    } else {
      return [
        { name: 'Aether-Neural-9B (Simulated)', details: 'Local Simulation' },
        { name: 'Aether-Coder-7B (Simulated)', details: 'Code Expert' }
      ];
    }
  }

  /**
   * Streams chat responses from the chosen provider.
   * @param {Array} messages - Chat logs history.
   * @param {Object} options - Temp, system prompt, max tokens etc.
   * @param {Function} onChunk - Callback for streaming chunks: (text, stats)
   * @param {Function} onError - Callback for error handling
   * @param {AbortController} abortController - To cancel requests
   */
  async streamChat(messages, options, onChunk, onError, abortController) {
    const systemPrompt = options.systemPrompt || '';
    const temp = options.temperature ?? 0.7;

    // Compile messages with system prompt if needed
    const apiMessages = [];
    if (systemPrompt) {
      apiMessages.push({ role: 'system', content: systemPrompt });
    }
    apiMessages.push(...messages);

    // If offline simulator mode is selected or forced
    if (this.provider === 'simulator') {
      return this._runSimulationStream(messages, options, onChunk, abortController);
    }

    if (this.provider === 'gemini') {
      try {
        const model = this.modelName || 'gemini-1.5-flash';
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${this.apiKey}`;
        
        // Convert messages to Gemini API contents schema
        const contents = [];
        
        // Setup system prompt instruction if present
        const systemInstruction = systemPrompt ? {
          parts: [{ text: systemPrompt }]
        } : undefined;

        messages.forEach(msg => {
          contents.push({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          });
        });

        const bodyPayload = {
          contents: contents,
          generationConfig: {
            temperature: temp,
            maxOutputTokens: options.maxTokens || 2048
          }
        };
        
        if (systemInstruction) {
          bodyPayload.systemInstruction = systemInstruction;
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload),
          signal: abortController.signal
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`Gemini API returned ${response.status}: ${errBody || 'Unknown Error'}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let startTimestamp = performance.now();
        let tokenCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          // Gemini returns JSON objects inside a streaming JSON array: [, { ... }, { ... }]
          // We can parse the stream using a simple brace-matching JSON scanner.
          let braceCount = 0;
          let startIndex = -1;
          
          for (let index = 0; index < buffer.length; index++) {
            const char = buffer[index];
            if (char === '{') {
              if (braceCount === 0) {
                startIndex = index;
              }
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && startIndex !== -1) {
                const jsonStr = buffer.slice(startIndex, index + 1);
                try {
                  const parsed = JSON.parse(jsonStr);
                  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (text) {
                    tokenCount += text.length / 4; // Estimate token count
                    const elapsedSec = (performance.now() - startTimestamp) / 1000;
                    const tokensPerSec = elapsedSec > 0 ? Math.round(tokenCount / elapsedSec) : 0;
                    onChunk(text, {
                      tokensPerSec: Math.min(tokensPerSec, 95),
                      evalCount: Math.round(tokenCount),
                      totalDuration: Math.round(elapsedSec * 10) / 10
                    });
                  }
                } catch (e) {
                  // Incomplete JSON, wait for next buffer chunk
                }
                
                // Clear the parsed part from buffer
                buffer = buffer.slice(index + 1);
                index = -1; // reset index scanner
                startIndex = -1;
              }
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('Stream aborted.');
        } else {
          onError(err);
        }
      }
      return;
    }

    if (this.provider === 'ollama') {
      try {
        const payload = {
          model: this.modelName || 'llama3',
          messages: apiMessages,
          options: {
            temperature: temp,
            num_predict: options.maxTokens || 2048
          },
          stream: true
        };

        const response = await fetch(`${this.ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: abortController.signal
        });

        if (!response.ok) throw new Error(`Ollama Server returned ${response.status}`);
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = '';
        let startTimestamp = performance.now();
        let tokenCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunkStr = decoder.decode(value, { stream: true });
          // Ollama outputs newline separated JSON strings
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              if (parsed.message?.content) {
                fullText += parsed.message.content;
                tokenCount++;
                const elapsedSec = (performance.now() - startTimestamp) / 1000;
                const tokensPerSec = elapsedSec > 0 ? Math.round(tokenCount / elapsedSec) : 0;
                
                onChunk(parsed.message.content, {
                  tokensPerSec,
                  evalCount: tokenCount,
                  totalDuration: Math.round(elapsedSec * 10) / 10
                });
              }
            } catch (e) {
              console.error('Failed to parse stream line:', line, e);
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('Stream aborted by user.');
        } else {
          onError(err);
        }
      }
    } else if (this.provider === 'openai' || this.provider === 'custom') {
      // OpenAI / Custom Endpoint implementation
      const endpoint = this.provider === 'openai' 
        ? 'https://api.openai.com/v1/chat/completions' 
        : this.customUrl;
        
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey || ''}`
          },
          body: JSON.stringify({
            model: this.modelName || 'gpt-4o',
            messages: apiMessages,
            temperature: temp,
            stream: true
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`API returned ${response.status}: ${errBody || 'Unknown Error'}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let startTimestamp = performance.now();
        let tokenCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Save the incomplete line back to buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith('data: ')) continue;
            const jsonStr = cleanLine.slice(6);
            if (jsonStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const text = parsed.choices?.[0]?.delta?.content;
              if (text) {
                tokenCount++;
                const elapsedSec = (performance.now() - startTimestamp) / 1000;
                const tokensPerSec = elapsedSec > 0 ? Math.round(tokenCount / elapsedSec) : 0;
                
                onChunk(text, {
                  tokensPerSec,
                  evalCount: tokenCount,
                  totalDuration: Math.round(elapsedSec * 10) / 10
                });
              }
            } catch (e) {
              // Ignore partial parsing issues
            }
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.log('Stream aborted.');
        } else {
          onError(err);
        }
      }
    }
  }

  /**
   * Extremely robust offline AI simulator stream.
   * Generates highly detailed and contextual responses in real-time.
   */
  _runSimulationStream(messages, options, onChunk, abortController) {
    const userPrompt = messages[messages.length - 1].content.trim();
    const presetId = options.presetId || 'general';
    
    // Choose simulator responses based on user query keyword matching
    let simulatedResponse = "";
    
    const query = userPrompt.toLowerCase();
    
    if (presetId === 'coder' || query.includes('code') || query.includes('寫個') || query.includes('程式') || query.includes('function') || query.includes('css')) {
      simulatedResponse = `這是一個非常實用的編程問題！針對您的需求，我特別為您編寫了一個符合現代最佳實踐、注重效能的解決方案。

### 🚀 解決方案：防抖函數 (Debounce) 的實作
在前端開發中，防抖 (Debounce) 是優化網頁效能（如監聽輸入框、視窗縮放等高頻事件）最常用的工具之一。

\`\`\`javascript
/**
 * 高效能防抖 (Debounce) 函數
 * @param {Function} func - 需要防抖的目標回調函數
 * @param {number} wait - 延遲執行的毫秒數 (預設 250ms)
 * @param {boolean} immediate - 是否在延遲開始前立即執行一次
 * @returns {Function} - 返回已防抖的包裝函數
 */
function debounce(func, wait = 250, immediate = false) {
  let timeout;
  
  return function(...args) {
    const context = this;
    
    const later = function() {
      timeout = null;
      if (!immediate) func.apply(context, args);
    };
    
    const callNow = immediate && !timeout;
    
    // 每次觸發時，清除上一次的定時器
    clearTimeout(timeout);
    
    // 設定新的定時器
    timeout = setTimeout(later, wait);
    
    // 如果設置了立即執行且當前沒有定時器，則立即調用
    if (callNow) {
      func.apply(context, args);
    }
  };
}
\`\`\`

### 💡 設計亮點與細節解析：
1. **閉包與 Context 綁定**：使用閉包儲存 \`timeout\` 狀態，並使用 \`func.apply(context, args)\` 確保目標函數內部的 \`this\` 指向與原始參數完全一致。
2. **參數轉發**：利用 ES6 剩餘參數 \`...args\` 靈活接收任何傳入引數，避免老舊的 \`arguments\` 性能開銷。
3. **立即執行選項**：額外支援 \`immediate\` 參數，可在使用者點擊按鈕的「第一瞬間」立即觸發響應，非常適合防止按鈕重複提交。

### 🛠️ 實戰應用範例：
\`\`\`javascript
// 範例：優化輸入框聯想搜尋
const searchInput = document.getElementById('search');

const handleSearch = debounce((event) => {
  console.log('向 API 發送請求，查詢關鍵字:', event.target.value);
}, 300);

searchInput.addEventListener('input', handleSearch);
\`\`\`

您可以直接複製這段代碼並在您的專案中使用！如果有其他語系（如 Python、Rust）的實作需求，也請隨時告訴我。`;
    } 
    else if (query.includes('量子') || query.includes('物理') || query.includes('quantum')) {
      simulatedResponse = `沒問題！我們來用一個非常生動且「小學生都能聽懂」的比喻，來解釋神祕的**量子力學 (Quantum Mechanics)**！

### 🪙 想像一枚旋轉的硬幣

假設桌上放著一枚硬幣。如果它靜止在那裡，它要麼是**正面**，要麼是**反面**。這就是我們平常生活的「傳統經典世界」，一切都是清清楚楚的。

現在，請用手指用力**旋轉**這枚硬幣！

當硬幣在桌上高速旋轉時，問你一個問題：**它是正面還是反面？**

> 答案是：在它停下來之前，它**既是正面也是反面**的混合狀態！

這就是量子力學的三大神奇概念：

1. **量子疊加 (Superposition)**：
   高速旋轉的硬幣就像量子粒子，它同時處於多種狀態的混合體。只有當你用手「啪」地按住硬幣（物理學稱之為**觀測**），它才會瞬間坍縮成一個確定的狀態（正面或反面）。
   
2. **量子糾纏 (Entanglement)**：
   想像我們有兩枚高速旋轉的魔法硬幣。把一隻放在你家，另一隻放到幾萬公里外的月球。只要你按住地球上這隻發現它是「正面」，月球上的那一隻就會**瞬間**變成「反面」！它們就像有心靈感應一樣，不管距離多遠都立刻同步。愛因斯坦稱這為「幽靈般的超距作用」。

3. **觀測者效應 (Observer Effect)**：
   在微觀量子世界中，我們「去看一眼」這個動作，就會徹底改變粒子的行為。量子就像一個害羞的小精靈，你不看它時它像水波一樣到處跳舞，你一看它，它立刻老老實實變成一顆小沙子。

### 🚀 這對我們未來有什麼用？
* **量子電腦**：比現在最強的超級電腦快上億倍，能在一瞬間破解最難的密碼、設計新藥。
* **量子加密**：利用「看一眼就會改變」的特性，做出絕對無法被竊聽的超級安全網路。

希望這個旋轉硬幣的比喻有幫你揭開量子的神祕面紗！是不是非常有趣呢？`;
    }
    else if (presetId === 'uiux' || query.includes('設計') || query.includes('ui') || query.includes('ux')) {
      simulatedResponse = `這是一個非常值得深入探討的 UI/UX 設計課題。作為一名嚴苛的評委，我將從**美學視覺**與**互動易用性 (Usability)** 兩個維度來給出犀利的點評與設計方案。

### 🚫 暗黑模式 (Dark Mode) 最容易犯的三大美學錯誤

1. **直接使用純黑色 (#000000) 作為背景**
   * **痛點**：純黑與亮白文字的對比度過高，會產生嚴重的視覺眩光 (Halation Effect)，看久了眼睛極度疲勞。
   * **解法**：應使用極深藍色或紫灰色（如 \`#080710\` 或 \`#0D0C15\`）作為底色，這能讓介面顯得沉穩高貴，且視覺體驗更柔和。

2. **硬把明亮主題的飽和度色彩直接套用**
   * **痛點**：高飽和度的亮藍、亮紅在深色背景下會產生「霓虹刺眼感」，且會模糊字體邊緣。
   * **解法**：在暗黑模式下，應將品牌色進行「褪色化」處理（降低飽和度，提高明度），或使用柔和的漸層光暈取代純色塊。

3. **缺乏層次感 (Elevation Hierarchy)**
   * **痛點**：許多設計師把卡片、彈窗、背景全部做成同一個深度，界面看起來像一張扁平的死板黑紙。
   * **解法**：越浮於上層的元件（如 Modal、下拉選單），背景色應該越「亮」（例如底色 \`#08080C\`，卡片 \`#161622\`，浮動視窗 \`#242435\`），並配合微弱的發光陰影。

---

### 🎨 推薦您的極致美學組件設計系統（CSS Variables）

\`\`\`css
:root {
  /* 深度層次 */
  --bg-base: #06050b;       /* 最底層 */
  --bg-surface: #12101e;    /* 卡片與容器 */
  --bg-overlay: #1e1b32;    /* 懸浮對話框 */
  
  /* 精緻毛玻璃 */
  --glass-effect: rgba(18, 16, 30, 0.45);
  --glass-border: rgba(255, 255, 255, 0.05);
  --glass-blur: blur(12px);
  
  /* 科技霓虹 */
  --glow-cyan: 0 0 15px rgba(0, 242, 254, 0.3);
  --glow-purple: 0 0 20px rgba(155, 81, 224, 0.2);
}
\`\`\`

> 💡 **微互動金句**：一個優秀的 UI 介面，就像會呼吸一樣。請善用 CSS 的 \`cubic-bezier(0.4, 0, 0.2, 1)\` 來設計按鈕的 hover 效果，讓每一次點擊都充滿奢華回饋感。`;
    }
    else if (query.includes('台南') || query.includes('旅遊') || query.includes('行程')) {
      simulatedResponse = `沒問題！為您規劃一份**充滿文青氣息、慢節奏且保證美味的「台南 3 天 2 夜美食輕旅行」**行程！這次我們避開人擠人的常規景點，走進老巷弄，感受古都的真正魅力。

### 🗓️ 台南文青美食輕旅行行程規劃

| 天數 | 上午行程 & 景點 | 中午/下午美味點心 | 晚上/深夜微醺與夜景 |
| :--- | :--- | :--- | :--- |
| **Day 1** | 抵達台南 ➔ **蝸牛巷**散步 | **小公園擔仔麵** ➔ **莉莉水果店**刨冰 | **神農街**老屋散策 ➔ **Bar TCRC** 老屋酒吧 |
| **Day 2** | **台南美術館二館**（極簡純白建築） | **阿村牛肉湯** ➔ **衛屋茶事**宇治抹茶 | **十鼓仁糖文創園區**夜景 ➔ **大東夜市** |
| **Day 3** | **漁光島**森林步道與防風林 | **安平同記豆花** ➔ **精選老宅咖啡廳** | 買**連得堂煎餅**當伴手禮 ➔ 滿載歸途 |

---

### 🎨 文青必訪重點指南：

1. **台南美術館二館**：
   由普立茲克建築獎得主坂茂設計，純白碎形幾何屋頂在陽光下灑落的陰影美到令人屏息。是拍照與沉澱心靈的最佳場所。
2. **蝸牛巷**：
   文學家葉石濤筆下的幽靜巷弄。裡面隱藏著許多精緻的手工藝小店與日式老宅，轉角還能遇到可愛的蝸牛裝置藝術。
3. **Bar TCRC**：
   隱身在老廟旁的百年老屋酒吧，是全台最頂尖的無酒單調酒聖地。調酒師會根據你當下的心情，量身調配專屬你的風味。

### 💡 旅行小貼士 (Tips)：
* **交通建議**：台南巷弄極窄，最適合的交通工具是租一台電動機車 (Gogoro/WeMo)，穿梭自如又環保。
* **排隊策略**：熱門牛肉湯（如六千）通常凌晨四點就開始排隊，如果不想熬夜，阿村或文章牛肉湯的午餐/晚餐時段也是極佳選擇！

祝您擁有一段充滿咖啡香與夕陽溫度的台南之旅！有任何景點想要微調，都可以隨時告訴我。`;
    }
    else {
      // General fall-back response based on system prompt / preset
      const presetName = getPresetById(presetId).name;
      simulatedResponse = `您好！我是 **AetherAI ${presetName}**。

目前我們處於**離線高效模擬模式 (Simulation Mode)**。這意味著即使您尚未啟動本機的 Ollama 服務或配置雲端 API，您依然可以完整體驗我超流暢的打字機串流回應、精美的 Markdown 程式碼高亮、一鍵複製代碼以及玻璃擬態 UI。

我能為您提供多種專業的 AI 協助，例如：
* 💻 **編程架構**：輸入「寫個 JS 函數」或「防抖函數」，我會立即展示炫酷的程式碼排版與複製按鈕。
* 🌀 **科學科普**：輸入「量子力學」或「物理」，看看我如何用生動的比喻向小學生解釋複雜物理。
* 🎨 **設計美學**：輸入「UI 設計」或「設計問題」，我會為您奉上犀利的視覺與互動流程改善方案。
* 🗺️ **創意文案與行程**：輸入「台南旅遊」獲得完整的排版表格與旅行貼士。

> 💡 **提示**：如果您已經啟動了本機的 **Ollama**，您可以在右側的 **「AI 控制面板」** 中將**模型來源**切換為 \`Ollama\`，並輸入您本機已下載的模型（例如 \`llama3\` 或 \`gemma\`），即可實時與您的本機 AI 進行真實的物理對話！

請問接下來您想測試哪方面的能力呢？`;
    }

    // Now implement chunk by chunk streaming to emulate genuine AI response.
    const chunks = [];
    // We break the response text into small word or character pieces
    let i = 0;
    while (i < simulatedResponse.length) {
      // Chunk sizes: 1 to 4 characters
      const len = Math.floor(Math.random() * 3) + 1;
      chunks.push(simulatedResponse.slice(i, i + len));
      i += len;
    }

    let chunkIdx = 0;
    let startTimestamp = performance.now();
    let tokenCount = 0;

    const timer = setInterval(() => {
      if (abortController.signal.aborted) {
        clearInterval(timer);
        return;
      }

      if (chunkIdx < chunks.length) {
        const text = chunks[chunkIdx];
        tokenCount += text.length / 2.5; // Arbitrary token multiplier for visual aesthetic
        const elapsedSec = (performance.now() - startTimestamp) / 1000;
        const tokensPerSec = elapsedSec > 0 ? Math.round(tokenCount / elapsedSec) : 0;
        
        onChunk(text, {
          tokensPerSec: Math.min(tokensPerSec, 95), // Cap for realism
          evalCount: Math.round(tokenCount),
          totalDuration: Math.round(elapsedSec * 10) / 10
        });
        chunkIdx++;
      } else {
        clearInterval(timer);
      }
    }, 18); // Fast, snappy typing

    return timer;
  }
}

// Instantiate globally
const aetherApi = new AetherAPI();
export { aetherApi };
