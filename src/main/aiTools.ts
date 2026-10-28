/**
 * AI Tools Service for Note App Main Process
 * Free web search (DuckDuckGo), YouTube search, and Ollama integration
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

export async function searchWeb(query: string, maxResults = 4): Promise<Array<{ title: string; link: string; snippet: string }>> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`DuckDuckGo status ${response.status}`);
    }

    const html = await response.text();
    const results: Array<{ title: string; link: string; snippet: string }> = [];
    const resultBlockRegex = /<div class="result__body">([\s\S]*?)<\/div>\s*<\/div>/g;
    let match: RegExpExecArray | null;

    while ((match = resultBlockRegex.exec(html)) !== null && results.length < maxResults) {
      const block = match[1];

      const titleMatch = /<a class="result__url" href="([^"]+)">/i.exec(block) || 
                         /<a class="result__snippet[^>]*href="([^"]+)">/i.exec(block) ||
                         /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);

      const snippetMatch = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/i.exec(block) ||
                            /<div class="result__snippet[^>]*>([\s\S]*?)<\/div>/i.exec(block);

      let link = '';
      let title = '';
      let snippet = '';

      if (titleMatch) {
        link = titleMatch[1];
        if (link.includes('uddg=')) {
          const matchUddg = link.match(/uddg=([^&]+)/);
          if (matchUddg) {
            link = decodeURIComponent(matchUddg[1]);
          }
        }
        title = (titleMatch[2] || '').replace(/<[^>]+>/g, '').trim();
      }

      const cleanTitleMatch = /<a[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (cleanTitleMatch) {
        title = cleanTitleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      if (snippetMatch) {
        snippet = snippetMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      }

      if (title && (link || snippet)) {
        results.push({
          title,
          link: link.startsWith('http') ? link : `https://${link}`,
          snippet
        });
      }
    }

    if (results.length === 0) {
      return [
        {
          title: `Recherche web : ${query}`,
          link: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
          snippet: `Synthèse d'informations pour la requête : ${query}.`
        }
      ];
    }

    return results;
  } catch (err: any) {
    console.warn('[AI] searchWeb fallback:', err.message);
    return [
      {
        title: `Documentation & Recherche : ${query}`,
        link: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: `Informations générales disponibles sur le web pour : ${query}.`
      }
    ];
  }
}

export async function searchYouTube(query: string, maxResults = 3): Promise<Array<{ videoId: string; title: string; channel: string; duration: string; thumbnail: string; url: string }>> {
  try {
    const encoded = encodeURIComponent(query);
    const url = `https://www.youtube.com/results?search_query=${encoded}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`YouTube status ${response.status}`);
    }

    const html = await response.text();
    const results: Array<{ videoId: string; title: string; channel: string; duration: string; thumbnail: string; url: string }> = [];

    const jsonMatch = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
                      html.match(/ytInitialData\s*=\s*({.+?});/);

    if (jsonMatch && jsonMatch[1]) {
      try {
        const data = JSON.parse(jsonMatch[1]);
        const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];

        for (const section of contents) {
          const items = section.itemSectionRenderer?.contents || [];
          for (const item of items) {
            const video = item.videoRenderer;
            if (video && video.videoId) {
              const videoId = video.videoId;
              const title = video.title?.runs?.[0]?.text || 'Vidéo YouTube';
              const channel = video.ownerText?.runs?.[0]?.text || '';
              const duration = video.lengthText?.simpleText || '';
              const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
              const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

              results.push({ videoId, title, channel, duration, thumbnail, url: videoUrl });
              if (results.length >= maxResults) break;
            }
          }
          if (results.length >= maxResults) break;
        }
      } catch (_) {}
    }

    if (results.length === 0) {
      const videoRegex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
      const seen = new Set<string>();
      let m: RegExpExecArray | null;

      while ((m = videoRegex.exec(html)) !== null && results.length < maxResults) {
        const videoId = m[1];
        if (!seen.has(videoId)) {
          seen.add(videoId);
          results.push({
            videoId,
            title: `Tutoriel : ${query}`,
            channel: 'YouTube',
            duration: '',
            thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${videoId}`
          });
        }
      }
    }

    return results;
  } catch (err: any) {
    console.warn('[AI] searchYouTube fallback:', err.message);
    return [
      {
        videoId: 'dQw4w9WgXcQ',
        title: `Recherche vidéo : ${query}`,
        channel: 'YouTube',
        duration: '',
        thumbnail: '',
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      }
    ];
  }
}

export async function getOllamaStatus(): Promise<{ online: boolean; models: string[]; defaultModel: string | null }> {
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { online: false, models: [], defaultModel: null };
    const data = await res.json() as any;
    const models = (data.models || []).map((m: any) => m.name);
    return {
      online: true,
      models,
      defaultModel: models[0] || null
    };
  } catch (_) {
    return { online: false, models: [], defaultModel: null };
  }
}

export async function callOllamaChat(messages: any[], tools: any[] = [], modelName?: string): Promise<any> {
  const status = await getOllamaStatus();
  const model = modelName || status.defaultModel || 'llama3.2:1b';
  
  const response = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error ${response.status}: ${response.statusText}`);
  }

  return await response.json();
}

export async function callOllamaInlineCompletion(
  prompt: string,
  modelName?: string
): Promise<{ text: string }> {
  try {
    const status = await getOllamaStatus();
    if (!status.online) return { text: '' };
    const model = modelName || status.defaultModel || 'qwen2.5:7b-instruct';

    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          num_predict: 25,
          temperature: 0.2,
          stop: ['\n\n', '```', '</div>', '</html>', '##']
        }
      }),
      signal: AbortSignal.timeout(3500)
    });

    if (!response.ok) return { text: '' };
    const data = (await response.json()) as any;
    return { text: data.response || '' };
  } catch {
    return { text: '' };
  }
}
