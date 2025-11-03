/**
 * KERIS RAG Chatbot API Client
 * Frontend API integration for the RAG chatbot system
 */

class APIClient {
  constructor() {
    this.baseURL = window.location.origin + '/api';
    this.apiKey = this.getApiKey();
  }

  getApiKey() {
    // In production, this should be set properly
    // For demo purposes, using a placeholder
    return 'demo-api-key';
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey
    };
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: this.getHeaders(),
      ...options
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * Chat with streaming response using Server-Sent Events
   * @param {Object} params - Chat parameters
   * @param {string} params.message - User message
   * @param {string} params.model - Model to use (chatgpt, claude, gemini)
   * @param {Array} params.history - Conversation history
   * @param {Function} onMessage - Callback for receiving streamed data
   * @returns {Promise<void>}
   */
  async chat({ message, model = 'chatgpt', history = [] }, onMessage) {
    const url = `${this.baseURL}/chat`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ message, model, history })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;

          if (line.startsWith('event: ')) {
            continue; // Skip event type lines
          }

          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              onMessage(data);
            } catch (error) {
              console.warn('Failed to parse SSE data:', line);
            }
          }
        }
      }

    } catch (error) {
      console.error('Chat streaming failed:', error);
      throw error;
    }
  }

  /**
   * Non-streaming chat (fallback)
   * @param {Object} params - Chat parameters
   * @returns {Promise<Object>} Chat response
   */
  async chatSync({ message, model = 'chatgpt', history = [] }) {
    return await this.request('/chat/sync', {
      method: 'POST',
      body: JSON.stringify({ message, model, history })
    });
  }

  /**
   * List uploaded files
   * @returns {Promise<Object>} Files list
   */
  async listFiles() {
    return await this.request('/files');
  }

  /**
   * Upload files
   * @param {FileList|Array} files - Files to upload
   * @returns {Promise<Object>} Upload result
   */
  async uploadFile(files) {
    const formData = new FormData();

    if (files instanceof FileList) {
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i]);
      }
    } else if (Array.isArray(files)) {
      files.forEach(file => formData.append('files', file));
    } else {
      formData.append('files', files);
    }

    const url = `${this.baseURL}/files`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-API-Key': this.apiKey
          // Don't set Content-Type for FormData
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }

  /**
   * Delete a file
   * @param {string} filename - File to delete
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(filename) {
    return await this.request(`/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
  }

  /**
   * Reindex a file
   * @param {string} filename - File to reindex
   * @returns {Promise<Object>} Reindex result
   */
  async reindexFile(filename) {
    return await this.request(`/reindex/${encodeURIComponent(filename)}`, {
      method: 'POST'
    });
  }

  /**
   * Get system health status
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    return await this.request('/health');
  }

  /**
   * Get detailed system status
   * @returns {Promise<Object>} System status
   */
  async getStatus() {
    return await this.request('/status');
  }

  /**
   * Get indexing statistics
   * @returns {Promise<Object>} Indexing stats
   */
  async getStats() {
    return await this.request('/files/stats');
  }
}

// Create global API instance
window.API = new APIClient();

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APIClient;
}