const OpenAI = require('openai');
const config = require('../config');
const logger = require('../infra/logger');
const metrics = require('../infra/metrics');
const redis = require('../infra/redis');
const qdrant = require('../infra/qdrant');
const embeddingService = require('./embedding');
const rerankService = require('./rerank');
const { TimeoutError, UpstreamError } = require('../infra/errorHandler');

class RAGService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey
    });
    this.setupPrompts();
  }

  setupPrompts() {
    this.systemPrompt = [
      '너는 한국어 RAG 어시스턴트다.',
      '답변에는 근거를 대괄호 인용형식 [문서명 p.페이지]으로 포함하라.',
      '근거가 불충분하면 추정임을 명시하고 추가로 필요한 정보를 제시하라.',
      '불필요한 장황함을 피하고 항목화하라.'
    ].join('\n');

    this.userTemplate = (message, context) => {
      return `질문: ${message}\n\n다음은 검색 컨텍스트이다:\n${context}`;
    };
  }

  async chat(message, model = 'chatgpt', history = [], useCache = true) {
    const start = Date.now();

    try {
      logger.info(`Starting chat with model: ${model}, query: "${message.substring(0, 100)}..."`);

      // 1. Compact history
      const compactHistory = this.compactHistory(history);

      // 2. Embed query
      const queryVector = await embeddingService.embedQuery(message);

      // 3. Retrieve from Qdrant
      const retrievedDocs = await this.retrieve(queryVector);

      // 4. Apply MMR for diversity
      const diversifiedDocs = this.applyMMR(retrievedDocs, queryVector);

      // 5. Deduplicate and merge
      const dedupedDocs = this.deduplicateByDocPage(diversifiedDocs);

      // 6. Create snippets
      const snippets = this.createSnippets(dedupedDocs);

      // 7. Optional reranking
      const rerankedDocs = await rerankService.rankDocuments(message, snippets);

      // 8. Truncate context
      const context = this.truncateContext(rerankedDocs);

      // 9. Generate response with LLM streaming
      const response = await this.generateStreamingResponse(
        message,
        context,
        model,
        compactHistory
      );

      const duration = (Date.now() - start) / 1000;
      metrics.recordChatLatency(model, duration);

      logger.info(`Chat completed in ${duration}s with ${rerankedDocs.length} sources`);

      return {
        response,
        sources: this.extractSources(rerankedDocs),
        metadata: {
          model,
          retrievedCount: retrievedDocs.length,
          finalCount: rerankedDocs.length,
          duration
        }
      };

    } catch (error) {
      const duration = (Date.now() - start) / 1000;
      logger.error(`Chat failed after ${duration}s:`, error);

      if (error.name === 'TimeoutError') {
        throw new TimeoutError('Chat request timed out');
      }

      throw new UpstreamError(`Chat generation failed: ${error.message}`);
    }
  }

  compactHistory(history) {
    const maxTurns = config.rag.maxHistoryTurns;
    if (history.length <= maxTurns * 2) {
      return history;
    }

    // Keep the most recent turns
    return history.slice(-maxTurns * 2);
  }

  async retrieve(queryVector, limit = config.rag.searchK, scoreThreshold = 0.1) {
    const start = Date.now();

    try {
      const results = await qdrant.search(queryVector, limit, scoreThreshold);

      const duration = (Date.now() - start) / 1000;
      metrics.recordQdrantLatency(duration);

      logger.debug(`Retrieved ${results.length} documents in ${duration}s`);
      return results;

    } catch (error) {
      logger.error('Retrieval failed:', error);
      throw error;
    }
  }

  applyMMR(documents, queryVector, lambda = config.rag.mmrLambda, limit = config.rag.searchK) {
    if (documents.length <= 1) return documents;

    const selected = [];
    const candidates = [...documents];

    // Select first document (highest similarity)
    selected.push(candidates.shift());

    while (selected.length < limit && candidates.length > 0) {
      let bestIndex = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];

        // Relevance score (similarity to query)
        const relevance = candidate.score;

        // Diversity score (max similarity to already selected)
        let maxSimilarity = 0;
        for (const selected_doc of selected) {
          const similarity = this.cosineSimilarity(
            candidate.vector || [],
            selected_doc.vector || []
          );
          maxSimilarity = Math.max(maxSimilarity, similarity);
        }

        // MMR score
        const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }

      selected.push(candidates.splice(bestIndex, 1)[0]);
    }

    logger.debug(`Applied MMR: ${documents.length} -> ${selected.length} documents`);
    return selected;
  }

  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  deduplicateByDocPage(documents) {
    const seen = new Map();

    const deduped = documents.filter(doc => {
      const key = `${doc.payload.doc_id}_p${doc.payload.page}`;

      if (seen.has(key)) {
        // Keep the one with higher score
        const existing = seen.get(key);
        if (doc.score > existing.score) {
          seen.set(key, doc);
          return true;
        }
        return false;
      }

      seen.set(key, doc);
      return true;
    });

    logger.debug(`Deduplicated: ${documents.length} -> ${deduped.length} documents`);
    return deduped;
  }

  createSnippets(documents, windowSize = { min: 400, max: 800 }) {
    return documents.map(doc => {
      const text = doc.payload.text;
      let snippet = text;

      if (text.length > windowSize.max) {
        // Try to find sentence boundaries
        const sentences = text.split(/[.!?]+\s+/);
        let currentLength = 0;
        let selectedSentences = [];

        for (const sentence of sentences) {
          if (currentLength + sentence.length > windowSize.max) {
            break;
          }
          selectedSentences.push(sentence);
          currentLength += sentence.length;
        }

        snippet = selectedSentences.join('. ').trim();
        if (snippet.length < windowSize.min && text.length > snippet.length) {
          snippet = text.substring(0, windowSize.max).trim();
        }
      }

      return {
        ...doc,
        payload: {
          ...doc.payload,
          text: snippet
        }
      };
    });
  }

  truncateContext(documents, maxTokens = 4000) {
    const contextParts = documents.map(doc => {
      const { title, page, text } = doc.payload;
      return `- [${title} p.${page}] ${text}`;
    });

    let context = contextParts.join('\n\n');

    // Simple token estimation (4 chars ≈ 1 token for Korean)
    const estimatedTokens = context.length / 4;

    if (estimatedTokens > maxTokens) {
      const targetLength = maxTokens * 4;
      context = context.substring(0, targetLength);

      // Try to cut at sentence boundary
      const lastSentence = context.lastIndexOf('.');
      if (lastSentence > targetLength * 0.8) {
        context = context.substring(0, lastSentence + 1);
      }

      logger.warn(`Context truncated to ${context.length} chars (est. ${context.length / 4} tokens)`);
    }

    return context;
  }

  async generateStreamingResponse(message, context, model, history) {
    const llmModel = this.mapModel(model);
    const messages = [
      { role: 'system', content: this.systemPrompt },
      ...history,
      {
        role: 'user',
        content: this.userTemplate(message, context)
      }
    ];

    try {
      const stream = await this.openai.chat.completions.create({
        model: llmModel,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: true
      });

      let fullResponse = '';
      const chunks = [];

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          chunks.push(content);
        }
      }

      return fullResponse;

    } catch (error) {
      logger.error('LLM generation failed:', error);
      throw error;
    }
  }

  mapModel(model) {
    const modelMap = {
      'chatgpt': config.openai.model,
      'claude': 'claude-3-5-sonnet', // Note: This would need Anthropic client
      'gemini': 'gemini-1.5-pro'     // Note: This would need Google client
    };

    return modelMap[model] || config.openai.model;
  }

  extractSources(documents) {
    const sources = documents.map(doc => ({
      title: doc.payload.title,
      page: doc.payload.page,
      score: doc.score,
      citation: `[${doc.payload.title} p.${doc.payload.page}]`
    }));

    // Remove duplicates
    const uniqueSources = sources.filter((source, index, arr) =>
      arr.findIndex(s => s.citation === source.citation) === index
    );

    return uniqueSources;
  }

  async *streamChat(message, model = 'chatgpt', history = []) {
    const start = Date.now();

    try {
      logger.info(`Starting streaming chat with model: ${model}`);

      // Follow the same RAG flow but yield intermediate results
      yield { type: 'status', content: 'Embedding query...' };
      const queryVector = await embeddingService.embedQuery(message);

      yield { type: 'status', content: 'Searching documents...' };
      const retrievedDocs = await this.retrieve(queryVector);

      yield { type: 'status', content: 'Processing results...' };
      const diversifiedDocs = this.applyMMR(retrievedDocs, queryVector);
      const dedupedDocs = this.deduplicateByDocPage(diversifiedDocs);
      const snippets = this.createSnippets(dedupedDocs);

      yield { type: 'status', content: 'Reranking results...' };
      const rerankedDocs = await rerankService.rankDocuments(message, snippets);

      const context = this.truncateContext(rerankedDocs);
      const sources = this.extractSources(rerankedDocs);

      yield { type: 'sources', content: sources };
      yield { type: 'status', content: 'Generating response...' };

      // Stream the LLM response
      const llmModel = this.mapModel(model);
      const compactHistory = this.compactHistory(history);
      const messages = [
        { role: 'system', content: this.systemPrompt },
        ...compactHistory,
        {
          role: 'user',
          content: this.userTemplate(message, context)
        }
      ];

      const stream = await this.openai.chat.completions.create({
        model: llmModel,
        messages,
        temperature: 0.7,
        max_tokens: 2000,
        stream: true
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield { type: 'content', content };
        }
      }

      const duration = (Date.now() - start) / 1000;
      metrics.recordChatLatency(model, duration);

      yield { type: 'done', content: { duration, sources } };

    } catch (error) {
      logger.error('Streaming chat failed:', error);
      yield { type: 'error', content: error.message };
    }
  }
}

module.exports = new RAGService();