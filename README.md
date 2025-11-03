# KERIS RAG Chatbot

**한국교육학술정보원 AI Assistant** - Redis+ChatGPT+Qdrant RAG Chatbot with SSE Streaming, Asynchronous Indexing, MMR+LLM Reranking, Observability, Security, and Fallback mechanisms.

## Features

- **Real-time Streaming**: Server-Sent Events (SSE) for real-time chat responses
- **Advanced RAG**: MMR diversification + LLM reranking for better results
- **Multi-format Support**: PDF, DOCX, TXT, MD file processing
- **Asynchronous Processing**: BullMQ-based queue system for document indexing
- **Caching**: Redis-based caching for embeddings, retrieval, and answers
- **Security**: Rate limiting, API key authentication, input validation
- **Observability**: Prometheus metrics, structured logging, health checks
- **Resilience**: Circuit breakers, timeouts, fallback mechanisms

## Tech Stack

- **Backend**: Node.js + Express
- **Vector DB**: Qdrant
- **Cache/Queue**: Redis + BullMQ
- **LLM**: OpenAI GPT-4o-mini
- **Embeddings**: text-embedding-3-large
- **Frontend**: Vanilla JS with modern UI

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Docker & Docker Compose
- OpenAI API key

### 2. Setup

```bash
# Clone and install
git clone <repository>
cd keris-rag-chatbot
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Start infrastructure
docker compose up -d redis qdrant

# Run migration
npm run migrate

# Start development server
npm run dev
```

### 3. Access

- **Web Interface**: http://localhost:3000
- **API**: http://localhost:3000/api
- **Health Check**: http://localhost:3000/api/health
- **Metrics**: http://localhost:3000/api/metrics

## Configuration

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | 3000 | Server port |
| `OPENAI_API_KEY` | string | required | OpenAI API key |
| `OPENAI_MODEL` | string | gpt-4o-mini | LLM model |
| `EMBED_MODEL` | string | text-embedding-3-large | Embedding model |
| `QDRANT_URL` | string | http://localhost:6333 | Qdrant URL |
| `REDIS_URL` | string | redis://localhost:6379 | Redis URL |
| `TOP_K` | number | 6 | Number of documents to return |
| `SEARCH_K` | number | 20 | Number of documents to search |
| `MMR_LAMBDA` | number | 0.3 | MMR diversity parameter |
| `CHUNK_SIZE` | number | 1200 | Document chunk size |
| `CHUNK_OVERLAP` | number | 180 | Chunk overlap size |
| `RATE_LIMIT_RPM` | number | 60 | Rate limit per minute |
| `API_KEY` | string | required | API authentication key |

### RAG Configuration

- **Retrieval**: Vector similarity search with score threshold
- **MMR**: Maximal Marginal Relevance for diversity (λ=0.3)
- **Reranking**: OpenAI-based semantic reranking
- **Context**: Smart truncation with sentence boundaries
- **Citations**: Automatic source attribution

## API Reference

### Chat (Streaming)

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "message": "What is the main topic?",
    "model": "chatgpt",
    "history": []
  }'
```

### File Upload

```bash
curl -X POST http://localhost:3000/api/files \
  -H "X-API-Key: your-api-key" \
  -F "files=@document.pdf"
```

### File Management

```bash
# List files
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/files

# Delete file
curl -X DELETE -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/files/filename.pdf

# Reindex file
curl -X POST -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/reindex/filename.pdf
```

## Architecture

### RAG Flow

1. **History Compaction**: Limit conversation history
2. **Query Embedding**: Convert user query to vector
3. **Vector Retrieval**: Search Qdrant with similarity threshold
4. **MMR Diversification**: Apply Maximal Marginal Relevance
5. **Deduplication**: Merge overlapping document chunks
6. **Snippet Creation**: Extract relevant text windows
7. **Reranking**: Optional LLM-based reranking
8. **Context Truncation**: Fit within token limits
9. **LLM Generation**: Stream response with citations
10. **Source Attribution**: Return document references

### Document Processing Pipeline

1. **Upload**: File validation and storage
2. **Parse Queue**: Extract text by page (PDF/DOCX/TXT)
3. **Chunk**: Split into overlapping segments
4. **Embed Queue**: Generate vector embeddings
5. **Upsert Queue**: Store in Qdrant vector database

### Caching Strategy

- **Embeddings**: SHA-256 hash of text content
- **Retrieval**: Query hash + parameters + version
- **Reranking**: Query + document set hash
- **Answers**: Complete context hash
- **Invalidation**: Document-based key patterns

## Monitoring

### Health Checks

- **Liveness**: `/api/live` - Basic process health
- **Readiness**: `/api/ready` - Service dependencies
- **Health**: `/api/health` - Detailed component status

### Metrics (Prometheus)

- `chat_latency_seconds` - End-to-end response time
- `qdrant_search_latency_seconds` - Vector search time
- `llm_latency_seconds` - LLM API response time
- `cache_hits_total` / `cache_misses_total` - Cache performance
- `queue_lag_seconds` - Processing queue delays
- `errors_total` - Error counts by type

### Logging

Structured JSON logs with fields:
- Timestamp, level, request ID
- Route, latency, error details
- RAG pipeline stages and timing

## Security

- **API Key Authentication**: Required for all endpoints
- **Rate Limiting**: 60 requests/minute per IP
- **Input Validation**: File types, sizes, content
- **Security Headers**: Helmet.js protection
- **Error Handling**: No sensitive data in responses

## Production Deployment

### Docker

```bash
# Build and run with Docker Compose
docker compose --profile production up -d

# Or build separately
docker build -t keris-rag-chatbot .
docker run -p 3000:3000 keris-rag-chatbot
```

### Environment Setup

1. Set production environment variables
2. Configure external Redis and Qdrant
3. Set up monitoring and logging
4. Configure load balancer
5. Set up SSL/TLS termination

### Scaling

- **Stateless**: Horizontal scaling with load balancer
- **Queue Workers**: Scale processing workers independently
- **Caching**: Redis clustering for high availability
- **Vector DB**: Qdrant clustering for large datasets

## Development

### Project Structure

```
├── config/           # Configuration management
├── infra/           # Infrastructure services
│   ├── redis.js     # Redis client
│   ├── qdrant.js    # Qdrant client
│   ├── queue.js     # BullMQ setup
│   ├── logger.js    # Winston logging
│   ├── metrics.js   # Prometheus metrics
│   └── errorHandler.js
├── services/        # Business logic
│   ├── rag.js       # RAG orchestration
│   ├── embedding.js # OpenAI embeddings
│   ├── rerank.js    # Document reranking
│   ├── parser.js    # File parsing
│   └── indexer.js   # Document indexing
├── routes/          # API routes
│   ├── chat.js      # Chat endpoints
│   ├── files.js     # File management
│   └── health.js    # Health/metrics
├── assets/          # Frontend assets
├── storage/         # File storage
└── scripts/         # Utilities
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

### Testing

```bash
# Run evaluation
npm run eval

# Check health
curl http://localhost:3000/api/health

# Test file upload
curl -X POST -F "files=@test.pdf" \
  http://localhost:3000/api/files
```

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: GitHub Issues
- **Documentation**: This README
- **Health Check**: `/api/health`