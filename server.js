// ==========================================================================
// AetherAI Studio - Zero-Dependency Node.js Server (Cross-Platform Edition)
// Supports Windows, macOS, and Linux
// ==========================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let port = 8080;
const workspacePath = process.cwd();
const configPath = path.join(workspacePath, 'config.json');

// Ensure config.json exists
if (!fs.existsSync(configPath)) {
  const defaultConfig = {
    telegram_token: "",
    telegram_chat_id: "",
    discord_webhook: "",
    ollama_url: "http://localhost:11434",
    provider: "ollama",
    model_name: ""
  };
  fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
}

// Telegram Bridge polling interval holder
let tgBridgeInterval = null;

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.txt': 'text/plain; charset=utf-8'
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Discord Webhook Broadcaster
async function sendDiscordBroadcast(title, description, colorHex = "00f2fe") {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config.discord_webhook) return;
    
    const colorInt = parseInt(colorHex, 16);
    const body = {
      embeds: [{
        title: title,
        description: description,
        color: colorInt,
        timestamp: new Date().toISOString(),
        footer: { text: "AetherAI Studio Broadcast Engine" }
      }]
    };
    
    const url = new URL(config.discord_webhook);
    const options = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    
    const req = http.request(url, options);
    req.write(JSON.stringify(body));
    req.end();
  } catch (err) {
    console.error("Discord Broadcast failed:", err.message);
  }
}

// Helper: Make HTTP Request using node http/https
function makeRequest(targetUrl, method, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(targetUrl);
    const isHttps = parsedUrl.protocol === 'https:';
    const lib = isHttps ? require('https') : require('http');
    
    const cleanHeaders = {};
    for (const key in headers) {
      if (!['host', 'connection', 'content-length', 'expect', 'x-target-url'].includes(key.toLowerCase())) {
        cleanHeaders[key] = headers[key];
      }
    }
    
    const options = {
      method: method,
      headers: cleanHeaders,
      timeout: 30000
    };
    
    const req = lib.request(parsedUrl, options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });
    
    req.on('error', (err) => reject(err));
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// Execute Agent Tool Tag Actions
function runAgentAction(tag, content, filePathAttr = "") {
  return new Promise((resolve) => {
    try {
      if (tag === 'list_dir') {
        const files = [];
        const walk = (dir) => {
          fs.readdirSync(dir).forEach(file => {
            const fullPath = path.join(dir, file);
            if (file.startsWith('.') || file === 'node_modules' || file === 'OllamaSetup.exe') return;
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                walk(fullPath);
              } else {
                const rel = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
                files.push({ path: rel, size: stat.size });
              }
            } catch (e) {}
          });
        };
        walk(workspacePath);
        resolve(JSON.stringify(files));
      } 
      else if (tag === 'read_file') {
        const targetFile = path.resolve(workspacePath, content.trim().replace(/\//g, path.sep));
        if (targetFile.startsWith(workspacePath) && fs.existsSync(targetFile)) {
          resolve(fs.readFileSync(targetFile, 'utf8'));
        } else {
          resolve("Error: Access denied or file not found.");
        }
      } 
      else if (tag === 'write_file') {
        const targetFile = path.resolve(workspacePath, filePathAttr.trim().replace(/\//g, path.sep));
        if (targetFile.startsWith(workspacePath)) {
          const parentDir = path.dirname(targetFile);
          if (!fs.existsSync(parentDir)) {
            fs.mkdirSync(parentDir, { recursive: true });
          }
          fs.writeFileSync(targetFile, content, 'utf8');
          resolve(`Success: Wrote file to ${filePathAttr}`);
        } else {
          resolve("Error: Access denied.");
        }
      } 
      else if (tag === 'run_command') {
        const isWindows = process.platform === 'win32';
        const shellCmd = isWindows 
          ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${content.trim().replace(/"/g, '\\"')}"`
          : content.trim();
        
        exec(shellCmd, { cwd: workspacePath, timeout: 30000 }, (error, stdout, stderr) => {
          resolve((stdout || "") + (stderr || "") + (error ? `\n[Command error: ${error.message}]` : ""));
        });
      } else {
        resolve("Unknown agent action.");
      }
    } catch (err) {
      resolve(`Error executing action: ${err.message}`);
    }
  });
}

// Telegram Agent loop long-polling runner
function startTelegramBridge() {
  stopTelegramBridge();
  
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const token = config.telegram_token;
    const chatId = config.telegram_chat_id;
    
    if (!token || !chatId) return;
    
    console.log("Starting Telegram Bridge long poll daemon...");
    let lastUpdateId = 0;
    
    const pollFunc = async () => {
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&timeout=15`;
        const res = await makeRequest(url, 'GET');
        
        if (res.statusCode === 200) {
          const updates = JSON.parse(res.body);
          if (updates.ok && updates.result.length > 0) {
            for (const update of updates.result) {
              lastUpdateId = update.update_id;
              
              const message = update.message;
              if (message && message.chat.id.toString() === chatId.toString() && message.text) {
                const prompt = message.text;
                
                // Set typing action
                await makeRequest(`https://api.telegram.org/bot${token}/sendChatAction`, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ chat_id: chatId, action: 'typing' }));
                
                // Get active model settings
                const systemPrompt = "You are AetherAI, an offline command assistant. You can execute local actions by wrapping commands in xml tool tags.";
                const ollamaUrl = config.ollama_url || "http://localhost:11434";
                const provider = config.provider || "ollama";
                const activeModel = config.model_name || "llama3";
                
                // Standard Ollama/OpenAI query
                let responseText = "";
                try {
                  const targetModelUrl = provider === 'ollama' 
                    ? `${ollamaUrl}/api/chat`
                    : `${ollamaUrl}/v1/chat/completions`;
                    
                  const queryBody = provider === 'ollama'
                    ? { model: activeModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], stream: false }
                    : { model: activeModel, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], stream: false };
                    
                  const reqRes = await makeRequest(targetModelUrl, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(queryBody));
                  if (reqRes.statusCode === 200) {
                    const parsed = JSON.parse(reqRes.body);
                    responseText = provider === 'ollama' ? parsed.message.content : parsed.choices[0].message.content;
                  } else {
                    responseText = `Error: backend returned HTTP ${reqRes.statusCode}`;
                  }
                } catch (e) {
                  responseText = `Local model request failed: ${e.message}`;
                }
                
                // Check and parse Agent XML Tags
                let loopCount = 0;
                while (loopCount < 8) {
                  const writeRegex = /<write_file\s+path="([^"]+)">([\s\S]*?)<\/write_file>/i;
                  const readRegex = /<read_file>([\s\S]*?)<\/read_file>/i;
                  const listRegex = /<list_dir>([\s\S]*?)<\/list_dir>/i;
                  const runRegex = /<run_command>([\s\S]*?)<\/run_command>/i;
                  
                  let actTag = "";
                  let actContent = "";
                  let fileAttr = "";
                  let match = null;
                  
                  if ((match = responseText.match(writeRegex))) {
                    actTag = "write_file";
                    fileAttr = match[1];
                    actContent = match[2];
                  } else if ((match = responseText.match(readRegex))) {
                    actTag = "read_file";
                    actContent = match[1];
                  } else if ((match = responseText.match(listRegex))) {
                    actTag = "list_dir";
                    actContent = match[1];
                  } else if ((match = responseText.match(runRegex))) {
                    actTag = "run_command";
                    actContent = match[1];
                  }
                  
                  if (!actTag) break; // No agent actions found, proceed to report
                  
                  // Notify user of execution step
                  await makeRequest(`https://api.telegram.org/bot${token}/sendMessage`, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ chat_id: chatId, text: `🤖 *Agent Mode Executing*: \`<${actTag}>\``, parse_mode: 'Markdown' }));
                  
                  const runResult = await runAgentAction(actTag, actContent, fileAttr);
                  
                  // Feed back results
                  try {
                    const ollamaUrl = config.ollama_url || "http://localhost:11434";
                    const queryBody = {
                      model: activeModel,
                      messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: prompt },
                        { role: 'assistant', content: responseText },
                        { role: 'user', content: `Tool execution response:\n${runResult}` }
                      ],
                      stream: false
                    };
                    const targetModelUrl = provider === 'ollama' ? `${ollamaUrl}/api/chat` : `${ollamaUrl}/v1/chat/completions`;
                    const modelFeedback = await makeRequest(targetModelUrl, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(queryBody));
                    if (modelFeedback.statusCode === 200) {
                      const feedbackParsed = JSON.parse(modelFeedback.body);
                      responseText = provider === 'ollama' ? feedbackParsed.message.content : feedbackParsed.choices[0].message.content;
                    } else {
                      responseText += `\n\n[Warning: Agent recursive reasoning loop error: backend HTTP ${modelFeedback.statusCode}]`;
                      break;
                    }
                  } catch (e) {
                    responseText += `\n\n[Warning: Agent feedback loop failed: ${e.message}]`;
                    break;
                  }
                  loopCount++;
                }
                
                // Return final answer
                await makeRequest(`https://api.telegram.org/bot${token}/sendMessage`, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify({ chat_id: chatId, text: responseText, parse_mode: 'Markdown' }));
              }
            }
          }
        }
      } catch (err) {}
      
      // Schedule next poll immediately
      tgBridgeInterval = setTimeout(pollFunc, 1000);
    };
    
    tgBridgeInterval = setTimeout(pollFunc, 1000);
  } catch (err) {
    console.error("Start Telegram Bridge failed:", err.message);
  }
}

function stopTelegramBridge() {
  if (tgBridgeInterval) {
    clearTimeout(tgBridgeInterval);
    tgBridgeInterval = null;
    console.log("Telegram Bridge long poll stopped.");
  }
}

// Start Bridges on launch
startTelegramBridge();

// Web Server Implementation
const server = http.createServer((request, response) => {
  try {
    const parsedUrl = new URL(request.url, `http://localhost:${port}`);
    let urlPath = parsedUrl.pathname;
    
    // Set default CORS headers
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', '*');
    response.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    
    // Handle OPTIONS Preflight request
    if (request.method === 'OPTIONS') {
      response.statusCode = 200;
      response.end();
      return;
    }
    
    // ----------------------------------------------------
    // API Route: Cloud CORS Bypass Proxy
    // ----------------------------------------------------
    if (urlPath === '/api/proxy') {
      let targetUrl = request.headers['x-target-url'] || parsedUrl.searchParams.get('url');
      
      if (!targetUrl) {
        response.statusCode = 400;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end("400 Bad Request: Missing X-Target-URL header or url query parameter");
        return;
      }
      
      try {
        const parsedTarget = new URL(targetUrl);
        const isHttps = parsedTarget.protocol === 'https:';
        const lib = isHttps ? require('https') : require('http');
        
        const cleanHeaders = {};
        for (const key in request.headers) {
          if (!['host', 'connection', 'content-length', 'expect', 'x-target-url'].includes(key.toLowerCase())) {
            cleanHeaders[key] = request.headers[key];
          }
        }
        
        const options = {
          method: request.method,
          headers: cleanHeaders
        };
        
        const proxyReq = lib.request(parsedTarget, options, (proxyRes) => {
          response.statusCode = proxyRes.statusCode;
          
          for (const key in proxyRes.headers) {
            if (!['access-control-allow-origin', 'access-control-allow-headers', 'access-control-allow-methods', 'transfer-encoding'].includes(key.toLowerCase())) {
              response.setHeader(key, proxyRes.headers[key]);
            }
          }
          
          proxyRes.pipe(response);
        });
        
        proxyReq.on('error', (err) => {
          response.statusCode = 500;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(`Proxy Error: ${err.message}`);
        });
        
        request.pipe(proxyReq);
      } catch (err) {
        response.statusCode = 500;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end(`Proxy URL Parsing Error: ${err.message}`);
      }
      return;
    }
    
    // ----------------------------------------------------
    // API Route: Agent Mode List files
    // ----------------------------------------------------
    if (urlPath === '/api/agent/list') {
      try {
        const files = [];
        const walk = (dir) => {
          fs.readdirSync(dir).forEach(file => {
            const fullPath = path.join(dir, file);
            if (file.startsWith('.') || file === 'node_modules' || file === 'OllamaSetup.exe') return;
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                walk(fullPath);
              } else {
                const rel = path.relative(workspacePath, fullPath).replace(/\\/g, '/');
                files.push({ path: rel, size: stat.size });
              }
            } catch (e) {}
          });
        };
        walk(workspacePath);
        
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify(files));
      } catch (err) {
        response.statusCode = 500;
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.end(`Error: ${err.message}`);
      }
      return;
    }
    
    // ----------------------------------------------------
    // API Route: Agent Mode Read file
    // ----------------------------------------------------
    if (urlPath === '/api/agent/read') {
      const relPath = parsedUrl.searchParams.get('path');
      if (!relPath) {
        response.statusCode = 400;
        response.end("Missing path parameter");
        return;
      }
      
      const cleanPath = relPath.replace(/\//g, path.sep);
      const fullPath = path.resolve(workspacePath, cleanPath);
      
      if (fullPath.startsWith(workspacePath) && fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          response.statusCode = 200;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(content);
        } catch (e) {
          response.statusCode = 500;
          response.end("Error reading file");
        }
      } else {
        response.statusCode = 404;
        response.end("File not found or access denied");
      }
      return;
    }
    
    // ----------------------------------------------------
    // API Route: Agent Mode Write file
    // ----------------------------------------------------
    if (urlPath === '/api/agent/write') {
      const relPath = parsedUrl.searchParams.get('path');
      if (!relPath) {
        response.statusCode = 400;
        response.end("Missing path parameter");
        return;
      }
      
      const cleanPath = relPath.replace(/\//g, path.sep);
      const fullPath = path.resolve(workspacePath, cleanPath);
      
      if (fullPath.startsWith(workspacePath)) {
        let body = '';
        request.on('data', chunk => { body += chunk; });
        request.on('end', () => {
          try {
            const parentDir = path.dirname(fullPath);
            if (!fs.existsSync(parentDir)) {
              fs.mkdirSync(parentDir, { recursive: true });
            }
            fs.writeFileSync(fullPath, body, 'utf8');
            response.statusCode = 200;
            response.end("Success");
          } catch (e) {
            response.statusCode = 500;
            response.end(`Error: ${e.message}`);
          }
        });
      } else {
        response.statusCode = 403;
        response.end("Access denied");
      }
      return;
    }
    
    // ----------------------------------------------------
    // API Route: Agent Mode Run shell command
    // ----------------------------------------------------
    if (urlPath === '/api/agent/run') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        try {
          const payload = JSON.parse(body);
          if (!payload.command) {
            response.statusCode = 400;
            response.end("Missing command payload");
            return;
          }
          
          const isWindows = process.platform === 'win32';
          const shellCmd = isWindows 
            ? `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "${payload.command.trim().replace(/"/g, '\\"')}"`
            : payload.command.trim();
          
          exec(shellCmd, { cwd: workspacePath, timeout: 45000 }, (error, stdout, stderr) => {
            const output = (stdout || "") + (stderr || "") + (error ? `\n[Command error: ${error.message}]` : "");
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/plain; charset=utf-8');
            response.end(output);
          });
        } catch (e) {
          response.statusCode = 500;
          response.end(`Error: ${e.message}`);
        }
      });
      return;
    }
    
    // ----------------------------------------------------
    // API Route: Read Bridge Settings
    // ----------------------------------------------------
    if (urlPath === '/api/bridges/settings') {
      try {
        const config = fs.readFileSync(configPath, 'utf8');
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(config);
      } catch (e) {
        response.statusCode = 500;
        response.end(`Error: ${e.message}`);
      }
      return;
    }
    
    // ----------------------------------------------------
    // API Route: Save Bridge Settings
    // ----------------------------------------------------
    if (urlPath === '/api/bridges/save') {
      let body = '';
      request.on('data', chunk => { body += chunk; });
      request.on('end', () => {
        try {
          const newConfig = JSON.parse(body);
          const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          
          if (newConfig.telegram_token !== undefined) currentConfig.telegram_token = newConfig.telegram_token;
          if (newConfig.telegram_chat_id !== undefined) currentConfig.telegram_chat_id = newConfig.telegram_chat_id;
          if (newConfig.discord_webhook !== undefined) currentConfig.discord_webhook = newConfig.discord_webhook;
          if (newConfig.ollama_url !== undefined) currentConfig.ollama_url = newConfig.ollama_url;
          if (newConfig.provider !== undefined) currentConfig.provider = newConfig.provider;
          if (newConfig.model_name !== undefined) currentConfig.model_name = newConfig.model_name;
          
          fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
          
          startTelegramBridge();
          sendDiscordBroadcast("⚙️ Bridges Configuration Updated", "Bridges have been reconfigured and restarted successfully.", "9b51e0");
          
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(JSON.stringify({ status: "success" }));
        } catch (e) {
          response.statusCode = 500;
          response.end(`Error: ${e.message}`);
        }
      });
      return;
    }
    
    // ----------------------------------------------------
    // STATIC FILE SERVING
    // ----------------------------------------------------
    if (urlPath === '/') { urlPath = '/index.html'; }
    
    const cleanUrl = urlPath.replace(/\//g, path.sep).replace(/^\.+/, '');
    let filePath = path.join(workspacePath, cleanUrl);
    
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      // Fallback: Check inside the npm package installation folder
      const fallbackPath = path.join(__dirname, cleanUrl);
      if (fs.existsSync(fallbackPath) && fs.statSync(fallbackPath).isFile()) {
        filePath = fallbackPath;
      }
    }
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const fileBytes = fs.readFileSync(filePath);
      response.statusCode = 200;
      response.setHeader('Content-Type', getMimeType(filePath));
      response.end(fileBytes);
    } else {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'text/plain; charset=utf-8');
      response.end(`404 Not Found: ${urlPath}`);
    }
  } catch (err) {
    console.error("Error serving request:", err);
    try {
      response.statusCode = 500;
      response.end(`Internal Server Error: ${err.message}`);
    } catch (e) {}
  }
});

// Run HTTP Listener port discovery loop
function startServer() {
  server.listen(port, () => {
    console.log("==================================================");
    console.log("  AetherAI Studio Web Server is Running!");
    console.log(`  👉 http://localhost:${port}`);
    console.log("==================================================");
    sendDiscordBroadcast("🖥️ Web Server Started", `AetherAI Studio local Node.js server and CORS proxy started successfully on http://localhost:${port}`, "00f2fe");
  });
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
      console.log(`Port ${port} is occupied. Retrying on port ${port + 1}...`);
      port++;
      startServer();
    } else {
      console.error("Server Listener Error:", err.message);
    }
  });
}

startServer();

// Graceful Shutdown
process.on('SIGINT', () => {
  console.log("\nShutting down web server safely...");
  stopTelegramBridge();
  sendDiscordBroadcast("🛑 Web Server Stopped", "AetherAI Studio local static server and CORS proxy stopped safely.", "eb5757");
  server.close(() => {
    process.exit(0);
  });
});
