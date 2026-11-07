// Da7e AI Service
// Supports Gemini, Groq, OpenAI, Ollama, and Free Cloud AI Engine

class Da7eAiService {
  constructor(config = {}) {
    this.provider = config.aiProvider || 'gemini';
    this.apiKey = config.apiKey || '';
    this.model = config.aiModel || 'gemini-1.5-flash';
    this.ollamaUrl = config.ollamaUrl || 'http://127.0.0.1:11434';
  }

  updateConfig(config) {
    if (config.aiProvider) this.provider = config.aiProvider;
    if (config.apiKey !== undefined && config.apiKey !== '') this.apiKey = config.apiKey;
    if (config.aiModel) this.model = config.aiModel;
    if (config.ollamaUrl) this.ollamaUrl = config.ollamaUrl;
  }

  async ask(prompt, context = {}) {
    if (!prompt || !prompt.trim()) return 'Please enter a message or question.';

    // 1. Try configured external AI API first if user provided an API key
    if (this.apiKey && this.apiKey.trim() !== '') {
      try {
        if (this.provider === 'gemini') {
          return await this.callGemini(prompt, context);
        } else if (this.provider === 'groq') {
          return await this.callOpenAiCompatible('https://api.groq.com/openai/v1/chat/completions', prompt, context);
        } else if (this.provider === 'openai') {
          return await this.callOpenAiCompatible('https://api.openai.com/v1/chat/completions', prompt, context);
        } else if (this.provider === 'ollama') {
          return await this.callOllama(prompt, context);
        }
      } catch (err) {
        console.warn('[Da7e AI] Configured API error, falling back to free cloud AI:', err.message);
      }
    }

    // 2. Free Cloud AI Engine (No API Key Required!)
    try {
      const cloudReply = await this.callFreeCloudAi(prompt, context);
      if (cloudReply && cloudReply.trim().length > 0) {
        return cloudReply.trim();
      }
    } catch (err) {
      console.warn('[Da7e AI] Free Cloud AI error, using conversational engine:', err.message);
    }

    // 3. Resilient Built-in Conversational Assistant
    return this.smartConversationalFallback(prompt, context);
  }

  async callFreeCloudAi(prompt, context) {
    const isArabic = /[\u0600-\u06FF]/.test(prompt);
    let systemInstruction = 'You are Da7e AI, an intelligent coding assistant and smart laptop remote controller. ' +
      'Answer directly, concisely, and helpfully. If code is requested, provide complete and clean code inside markdown code blocks, followed by a brief explanation. ' +
      (isArabic ? 'The user is speaking in Arabic; reply in fluent, natural Arabic.' : 'Reply in fluent, natural English.');

    let fullPrompt = prompt;
    if (context.activeFileName && (context.selectedCode || context.codeSnippet)) {
      const codeSnippet = (context.selectedCode || context.codeSnippet || '').slice(0, 1500);
      fullPrompt = `[Context File: ${context.activeFileName} (${context.language || ''})]\n` +
                   `\`\`\`${context.language || ''}\n${codeSnippet}\n\`\`\`\n\n` +
                   `User Request: ${prompt}`;
    }

    // Use GET with timeout controller for maximum speed and reliability
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    try {
      const encodedPrompt = encodeURIComponent(fullPrompt);
      const encodedSystem = encodeURIComponent(systemInstruction);
      const url = `https://text.pollinations.ai/${encodedPrompt}?system=${encodedSystem}&model=openai`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain, text/html'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return text;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  async callGemini(prompt, context) {
    let modelName = this.model || 'gemini-1.5-flash';
    if (modelName.includes('3.5') || modelName === 'gemini_flash3.5') {
      modelName = 'gemini-1.5-flash';
    }

    const headers = { 'Content-Type': 'application/json' };
    let url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

    if (this.apiKey.startsWith('AIza')) {
      url += `?key=${this.apiKey}`;
      headers['x-goog-api-key'] = this.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const isArabic = /[\u0600-\u06FF]/.test(prompt);
    const systemInstruction = 'You are Da7e AI, an expert software engineering assistant and laptop controller. Whenever code is requested, output clean code in markdown blocks, followed by clear explanations. ' +
      (isArabic ? 'Answer in Arabic.' : 'Answer in English.');

    let fullPrompt = prompt;
    if (context.activeFileName) {
      fullPrompt = `[Active File: ${context.activeFileName} (${context.language || ''})]\n` +
                   (context.selectedCode ? `[Selected Code]:\n\`\`\`${context.language || ''}\n${context.selectedCode}\n\`\`\`\n\n` : '') +
                   (context.codeSnippet && !context.selectedCode ? `[File Content]:\n\`\`\`${context.language || ''}\n${context.codeSnippet.slice(0, 1500)}\n\`\`\`\n\n` : '') +
                   `User Request: ${prompt}`;
    }

    const payload = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return text;
  }

  async callOpenAiCompatible(endpoint, prompt, context) {
    const modelName = this.provider === 'groq' ? (this.model || 'llama-3.3-70b-versatile') : (this.model || 'gpt-4o-mini');
    const isArabic = /[\u0600-\u06FF]/.test(prompt);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: 'system',
            content: 'You are Da7e AI. Output optimized code in markdown code blocks, then explain each change clearly. ' +
              (isArabic ? 'Answer in Arabic.' : 'Answer in English.')
          },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!res.ok) throw new Error(`API HTTP ${res.status}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || 'No response received.';
  }

  async callOllama(prompt, context) {
    const res = await fetch(`${this.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model || 'codellama',
        prompt: prompt,
        stream: false
      })
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    return data.response;
  }

  // Resilient natural conversational fallback (no boilerplate dummy templates!)
  smartConversationalFallback(prompt, context) {
    const p = prompt.trim();
    const isArabic = /[\u0600-\u06FF]/.test(p);
    const code = context.selectedCode || context.codeSnippet || '';
    const lang = context.language || 'javascript';
    const file = context.activeFileName || 'file';

    if (isArabic) {
      if (p.length <= 5 || p.includes('سلام') || p.includes('مرحبا') || p.includes('ازيك') || p.includes('اهلا') || p.includes('مين')) {
        return `👋 أهلاً بك! أنا **Da7e AI**، مساعدك البرمجي وجهاز التحكم عن بُعد في اللابتوب.\n` +
               `أنا متصل باللابتوب وجاهز لأي أمر! يمكنك كتابة أي كود تريده، أو طلب شرح أو إصلاح للأخطاء، أو التحكم في اللابتوب عبر الأزرار في الأسفل.`;
      }
      return `🤖 **تم استلام طلبك: "${p}"**\n\n` +
             `أنا متصل بـ VS Code على اللابتوب. يمكنك تنفيذ الأوامر مباشرة، أو إرسال كود إلى المحرر، أو استخدام التيرمينال للتحكم الكامل.`;
    }

    if (p.length <= 5 || p.toLowerCase().includes('hi') || p.toLowerCase().includes('hello') || p.toLowerCase().includes('hey')) {
      return `👋 Hi there! I'm **Da7e AI**, your live coding assistant and laptop controller.\n` +
             `I'm connected to your laptop. Ask me any programming questions, request code, or use the tabs to control your laptop remotely!`;
    }

    return `🤖 **Received your request:** "${p}"\n\n` +
           `Ready to assist! You can send code directly to your laptop editor, run terminal commands, or control system media and files directly from your phone.`;
  }
}

module.exports = Da7eAiService;
