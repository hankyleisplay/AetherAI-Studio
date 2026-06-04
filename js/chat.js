/* ==========================================================================
   AetherAI Studio - Markdown Compiler & Chat Log History Manager
   ========================================================================== */

/**
 * Super lightweight, regex-based Markdown compiler that handles
 * paragraphs, headers, tables, lists, blockquotes, inline code, bold/italics
 * and complete code blocks with language indicators.
 */
function compileMarkdown(markdownText) {
  if (!markdownText) return '';

  let html = markdownText;

  // 1. Clean HTML entities to prevent raw injection, preserving code syntax markers
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Restore blockquote symbol
  html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote>$1</blockquote>');

  // 2. Pre-process code blocks: Replace triple backtick blocks with a temporary safe token
  const codeBlocks = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  html = html.replace(codeBlockRegex, (match, lang, code) => {
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
    codeBlocks.push({ lang: lang || 'code', code: code.trim() });
    return placeholder;
  });

  // 3. Pre-process inline code: Replace single backticks
  const inlineCodes = [];
  const inlineCodeRegex = /`([^`]+)`/g;
  html = html.replace(inlineCodeRegex, (match, code) => {
    const placeholder = `__INLINE_CODE_PLACEHOLDER_${inlineCodes.length}__`;
    inlineCodes.push(code);
    return placeholder;
  });

  // 4. Tables parsing
  const tableRegex = /\|([^\n]+)\|\r?\n\|[ :|-]+\|\r?\n((?:\|[^\n]+\|\r?\n?)*)/g;
  html = html.replace(tableRegex, (match, headerRow, bodyRows) => {
    const headers = headerRow.split('|').map(h => h.trim()).filter(h => h);
    let tableHtml = '<table><thead><tr>';
    headers.forEach(h => {
      tableHtml += `<th>${h}</th>`;
    });
    tableHtml += '</tr></thead><tbody>';

    const rows = bodyRows.trim().split('\n');
    rows.forEach(row => {
      if (!row.trim()) return;
      const cols = row.split('|').map(c => c.trim()).filter((c, idx, arr) => {
        // filter out first and last elements if they are empty from boundary pipes
        return idx > 0 && idx < arr.length - 1;
      });
      tableHtml += '<tr>';
      cols.forEach(col => {
        tableHtml += `<td>${col}</td>`;
      });
      tableHtml += '</tr>';
    });

    tableHtml += '</tbody></table>';
    return tableHtml;
  });

  // 5. Headers (h1 - h4)
  html = html.replace(/^#### (.*)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');

  // 6. Lists
  // Unordered lists
  html = html.replace(/^\s*[-*+]\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  // Handle nesting repairs if any, but simpler is better
  
  // Ordered lists
  html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<ol-item>$1</ol-item>');
  html = html.replace(/<ol-item>(.*)<\/ol-item>/g, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');

  // Clean double list wrappings
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/<\/ol>\s*<ol>/g, '');

  // 7. Bold and Italics
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

  // 8. Paragraphs: Wrap lines that aren't tags
  const lines = html.split('\n');
  const processedLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return '';
    // If it already starts with a structural block HTML tag, keep it as is
    if (/^<\/?(h[1-4]|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|div|p)/i.test(trimmed)) {
      return line;
    }
    return `<p>${line}</p>`;
  });
  html = processedLines.filter(l => l).join('\n');

  // 9. Re-inject inline code placeholders
  inlineCodes.forEach((code, index) => {
    html = html.replace(`__INLINE_CODE_PLACEHOLDER_${index}__`, `<code>${code}</code>`);
  });

  // 10. Re-inject code blocks with syntax highlighting & copy headers
  codeBlocks.forEach((block, index) => {
    const highlightedCode = applySyntaxHighlight(block.code, block.lang);
    const blockHtml = `
      <pre><div class="code-header">
        <span class="code-header-lang">${block.lang}</span>
        <button class="btn-copy" onclick="copyCodeSnippet(this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span>Copy</span>
        </button>
      </div><code class="language-${block.lang}">${highlightedCode}</code></pre>
    `.trim();
    html = html.replace(`__CODE_BLOCK_PLACEHOLDER_${index}__`, blockHtml);
  });

  return html;
}

/**
 * Lightweight syntax highlighter for HTML, CSS, JavaScript, and JSON code blocks.
 */
function applySyntaxHighlight(code, lang) {
  const language = (lang || '').toLowerCase();
  
  if (!['javascript', 'js', 'html', 'css', 'json'].includes(language)) {
    return code; // Standard return if language is not supported
  }

  let highlighted = code;

  if (language === 'javascript' || language === 'js') {
    // Highlight Keywords
    highlighted = highlighted.replace(/\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|export|import|from|default|new|this|typeof|instanceof|async|await|try|catch|finally|throw)\b/g, '<span style="color: #ff79c6; font-weight: 500;">$1</span>');
    // Highlight Core types
    highlighted = highlighted.replace(/\b(true|false|null|undefined|NaN|Number|String|Boolean|Array|Object|Promise|Map|Set)\b/g, '<span style="color: #bd93f9;">$1</span>');
    // Highlight comments
    highlighted = highlighted.replace(/(\/\/[^\n]*)/g, '<span style="color: #6272a4; font-style: italic;">$1</span>');
    highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color: #6272a4; font-style: italic;">$1</span>');
    // Highlight strings
    highlighted = highlighted.replace(/(['"`])(.*?)\1/g, '<span style="color: #f1fa8c;">$1$2$1</span>');
  } 
  else if (language === 'css') {
    // Selectors
    highlighted = highlighted.replace(/([^{]+)\s*\{/g, '<span style="color: #50fa7b;">$1</span> {');
    // Properties
    highlighted = highlighted.replace(/([\w-]+)\s*:/g, '<span style="color: #ff79c6;">$1</span>:');
    // Values
    highlighted = highlighted.replace(/:\s*([^;]+);/g, ': <span style="color: #f1fa8c;">$1</span>;');
  } 
  else if (language === 'html') {
    // Tag names
    highlighted = highlighted.replace(/&lt;(\/?)(\w+)([^&]*)&gt;/g, (match, slash, tag, attrs) => {
      const highlightedAttrs = attrs.replace(/(\w+)=(['"])(.*?)\2/g, '<span style="color: #50fa7b;">$1</span>=<span style="color: #f1fa8c;">$2$3$2</span>');
      return `&lt;${slash}<span style="color: #ff79c6;">${tag}</span>${highlightedAttrs}&gt;`;
    });
  } 
  else if (language === 'json') {
    // Keys
    highlighted = highlighted.replace(/("[\w-]+")\s*:/g, '<span style="color: #ff79c6;">$1</span>:');
    // Strings values
    highlighted = highlighted.replace(/:\s*(".*?")/g, ': <span style="color: #f1fa8c;">$1</span>');
    // Numbers/Booleans values
    highlighted = highlighted.replace(/:\s*(true|false|null|\d+)/g, ': <span style="color: #bd93f9;">$1</span>');
  }

  return highlighted;
}

/**
 * Dynamic Global copy handler (injected into window scope)
 */
window.copyCodeSnippet = function(button) {
  const codeElement = button.closest('pre').querySelector('code');
  if (!codeElement) return;
  
  // Use textContent to get clean plain text without HTML span formatting tags
  const plainText = codeElement.textContent;
  
  navigator.clipboard.writeText(plainText).then(() => {
    const textSpan = button.querySelector('span');
    const originalText = textSpan.innerText;
    textSpan.innerText = 'Copied!';
    button.style.color = '#00f2fe';
    
    setTimeout(() => {
      textSpan.innerText = originalText;
      button.style.color = '';
    }, 2000);
  }).catch(err => {
    console.error('Could not copy text: ', err);
  });
};

/* ==========================================================================
   Conversation Logs / LocalStorage Database Controller
   ========================================================================== */

class ChatHistoryManager {
  constructor() {
    this.storageKey = 'aether_conversations';
    this.activeChatKey = 'aether_active_chat_id';
    this.conversations = this._loadFromStorage();
  }

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to load conversations from local storage', e);
      return [];
    }
  }

  _saveToStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.conversations));
    } catch (e) {
      console.error('Failed to save conversations to local storage', e);
    }
  }

  getActiveChatId() {
    return localStorage.getItem(this.activeChatKey) || null;
  }

  setActiveChatId(id) {
    if (id) {
      localStorage.setItem(this.activeChatKey, id);
    } else {
      localStorage.removeItem(this.activeChatKey);
    }
  }

  getAllChats() {
    return this.conversations;
  }

  getChatById(id) {
    return this.conversations.find(c => c.id === id) || null;
  }

  /**
   * Creates a new conversation and persists it.
   */
  createChat(modelName = 'AetherAI Simulator', systemPrompt = '', presetId = 'general') {
    const newChat = {
      id: 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      title: '新對話',
      model: modelName,
      presetId: presetId,
      systemPrompt: systemPrompt,
      createdAt: new Date().toISOString(),
      messages: [] // Array of {role: 'user'|'assistant', content: string, timestamp: string}
    };
    this.conversations.unshift(newChat);
    this._saveToStorage();
    this.setActiveChatId(newChat.id);
    return newChat;
  }

  /**
   * Appends a message to an existing conversation.
   */
  appendMessage(chatId, role, content) {
    const chat = this.getChatById(chatId);
    if (!chat) return null;

    chat.messages.push({
      role,
      content,
      timestamp: new Date().toISOString()
    });

    // Automatically rename conversation title if it was the default "新對話" and this is the first user prompt
    if (chat.title === '新對話' && role === 'user') {
      const maxTitleLen = 22;
      let newTitle = content.trim();
      if (newTitle.length > maxTitleLen) {
        newTitle = newTitle.slice(0, maxTitleLen) + '...';
      }
      chat.title = newTitle;
    }

    this._saveToStorage();
    return chat;
  }

  /**
   * Rename a conversation title.
   */
  renameChat(id, newTitle) {
    const chat = this.getChatById(id);
    if (chat && newTitle.trim()) {
      chat.title = newTitle.trim();
      this._saveToStorage();
      return true;
    }
    return false;
  }

  /**
   * Deletes a conversation by ID.
   */
  deleteChat(id) {
    const idx = this.conversations.findIndex(c => c.id === id);
    if (idx !== -1) {
      this.conversations.splice(idx, 1);
      this._saveToStorage();
      
      const currentActive = this.getActiveChatId();
      if (currentActive === id) {
        // Set new active to first item or null
        const nextActive = this.conversations.length > 0 ? this.conversations[0].id : null;
        this.setActiveChatId(nextActive);
      }
      return true;
    }
    return false;
  }

  /**
   * Clears all conversations.
   */
  clearAll() {
    this.conversations = [];
    this._saveToStorage();
    this.setActiveChatId(null);
  }
}

const chatHistory = new ChatHistoryManager();
export { compileMarkdown, chatHistory };
