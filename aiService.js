// Da7e AI Service
// Supports Gemini (gemini-3.5-flash-lite, gemini-3.5-flash, gemini-3.6-flash), Groq, OpenAI, Ollama, and Free Cloud AI

class Da7eAiService {
  constructor(config = {}) {
    this.provider = config.aiProvider || 'gemini';
    this.apiKey = config.apiKey || '';
    this.model = config.aiModel || 'gemini-3.5-flash-lite';
    this.ollamaUrl = config.ollamaUrl || 'http://127.0.0.1:11434';
  }

  updateConfig(config) {
    if (config.aiProvider) this.provider = config.aiProvider;
    if (config.apiKey !== undefined && config.apiKey !== '') this.apiKey = config.apiKey.trim();
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
        console.warn('[Da7e AI] Primary API failed:', err.message, '- trying fallback cloud engine...');
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

  async callGemini(prompt, context) {
    // Modern Google Gemini models (Gemini 1.5/2.5 are retired for new keys)
    let candidateModels = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash'];
    if (this.model && !this.model.includes('1.5') && !this.model.includes('2.5')) {
      candidateModels = [this.model, ...candidateModels];
    }
    const uniqueModels = [...new Set(candidateModels)];

    const isArabic = /[\u0600-\u06FF]/.test(prompt);
    const systemInstruction = 'You are Da7e AI, an expert programming assistant and laptop remote controller. ' +
      'Answer directly, smartly, and helpfully. If code is requested, provide complete and clean code inside markdown code blocks, followed by a clear explanation. ' +
      (isArabic ? 'The user is speaking in Arabic; reply in fluent, natural Arabic.' : 'Reply in fluent, natural English.');

    let fullPrompt = prompt;
    if (context.activeFileName && (context.selectedCode || context.codeSnippet)) {
      const snippet = (context.selectedCode || context.codeSnippet || '').slice(0, 3000);
      fullPrompt = `[Active File: ${context.activeFileName} (${context.language || ''})]\n` +
                   `\`\`\`${context.language || ''}\n${snippet}\n\`\`\`\n\n` +
                   `User Request: ${prompt}`;
    }

    const payload = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] }
    };

    let lastError = null;

    // Try each valid model until one succeeds
    for (const modelName of uniqueModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
        const headers = {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey
        };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
        }

        const data = await res.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;
        if (text && text.trim().length > 0) {
          return text.trim();
        }
      } catch (err) {
        lastError = err;
        console.warn(`[Da7e AI] Gemini model ${modelName} error:`, err.message);
      }
    }

    throw lastError || new Error('All Gemini models failed');
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
            content: 'You are Da7e AI, an expert programming assistant and laptop controller. ' +
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

  async callFreeCloudAi(prompt, context) {
    const isArabic = /[\u0600-\u06FF]/.test(prompt);
    const systemInstruction = 'You are Da7e AI, an intelligent coding assistant and smart laptop remote controller. ' +
      (isArabic ? 'Answer in fluent Arabic.' : 'Answer in English.');

    // Limit prompt length so it stays within URL constraints
    const cleanPrompt = prompt.slice(0, 500);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const encodedPrompt = encodeURIComponent(cleanPrompt);
      const encodedSystem = encodeURIComponent(systemInstruction);
      const url = `https://text.pollinations.ai/${encodedPrompt}?system=${encodedSystem}&model=openai`;

      const res = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'text/plain, text/html' },
        signal: controller.signal
      });

      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  }

  smartConversationalFallback(prompt, context) {
    const p = prompt.trim();
    const isArabic = /[\u0600-\u06FF]/.test(p);

    if (isArabic) {
      if (p.length <= 5 || p.includes('سلام') || p.includes('مرحبا') || p.includes('ازيك') || p.includes('اهلا') || p.includes('مين')) {
        return `👋 أهلاً بك! أنا **Da7e AI**، مساعدك البرمجي وجهاز التحكم عن بُعد في اللابتوب.\n` +
               `أنا متصل باللابتوب وجاهز لمساعدتك في أي سؤال أو كتابة كود أو التحكم في اللابتوب!`;
      }
      return `🤖 **تم استلام رسالتك بنجاح!**\n\n` +
             `الطلب: "${p}"\n` +
             `أنا متصل بـ VS Code على اللابتوب. يمكنك إرسال الأكواد مباشرة للمحرر أو تشغيل التيرمينال من التبويبات بالأسفل.`;
    }

    return `🤖 **Da7e AI Connected & Ready!**\n\n` +
           `Received: "${p}"\n` +
           `You can control your laptop, run terminal commands, and insert code directly into VS Code from your phone!`;
  }
}

module.exports = Da7eAiService;
