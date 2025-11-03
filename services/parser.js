const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../infra/logger');

class ParserService {
  constructor() {
    this.storageDir = config.document.storageDir;
    this.ensureStorageDir();
  }

  async ensureStorageDir() {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create storage directory:', error);
    }
  }

  async parseFile(filePath, filename, mimeType) {
    try {
      logger.info(`Parsing file: ${filename} (${mimeType})`);

      let pages = [];
      const ext = path.extname(filename).toLowerCase();

      switch (ext) {
        case '.pdf':
          pages = await this.parsePDF(filePath);
          break;
        case '.docx':
          pages = await this.parseDOCX(filePath);
          break;
        case '.txt':
        case '.md':
          pages = await this.parseText(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${ext}`);
      }

      const document = {
        id: uuidv4(),
        filename,
        mimeType,
        pages,
        totalPages: pages.length,
        parsedAt: new Date().toISOString(),
        source: 'upload'
      };

      logger.info(`Parsed ${filename}: ${pages.length} pages, ${pages.reduce((sum, p) => sum + p.text.length, 0)} characters`);
      return document;

    } catch (error) {
      logger.error(`Failed to parse file ${filename}:`, error);
      throw error;
    }
  }

  async parsePDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);

      // PDF parsing returns full text, we need to split by pages
      const pages = [];
      const text = data.text;

      if (data.numpages && data.numpages > 1) {
        // Try to split text by page breaks or estimate
        const avgCharsPerPage = Math.ceil(text.length / data.numpages);
        let currentPos = 0;

        for (let i = 0; i < data.numpages; i++) {
          let pageText;
          if (i === data.numpages - 1) {
            // Last page gets remaining text
            pageText = text.substring(currentPos);
          } else {
            // Find a good break point near the average
            let endPos = currentPos + avgCharsPerPage;
            // Look for paragraph break
            const nextParagraph = text.indexOf('\n\n', endPos);
            if (nextParagraph > 0 && nextParagraph < endPos + 200) {
              endPos = nextParagraph;
            }
            pageText = text.substring(currentPos, endPos);
            currentPos = endPos;
          }

          if (pageText.trim()) {
            pages.push({
              page: i + 1,
              text: pageText.trim()
            });
          }
        }
      } else {
        // Single page or couldn't determine pages
        pages.push({
          page: 1,
          text: text.trim()
        });
      }

      return pages;
    } catch (error) {
      logger.error('PDF parsing error:', error);
      throw new Error(`PDF parsing failed: ${error.message}`);
    }
  }

  async parseDOCX(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value;

      // Split DOCX content into logical pages (by page breaks or sections)
      const pages = [];
      const sections = text.split(/\n\s*\n\s*\n/); // Split on double line breaks

      sections.forEach((section, index) => {
        const trimmed = section.trim();
        if (trimmed) {
          pages.push({
            page: index + 1,
            text: trimmed
          });
        }
      });

      return pages.length > 0 ? pages : [{
        page: 1,
        text: text.trim()
      }];

    } catch (error) {
      logger.error('DOCX parsing error:', error);
      throw new Error(`DOCX parsing failed: ${error.message}`);
    }
  }

  async parseText(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      // For text files, split into logical sections
      const sections = content.split(/\n\s*---\s*\n|\n\s*===\s*\n/); // Split on horizontal rules
      const pages = [];

      sections.forEach((section, index) => {
        const trimmed = section.trim();
        if (trimmed) {
          pages.push({
            page: index + 1,
            text: trimmed
          });
        }
      });

      return pages.length > 0 ? pages : [{
        page: 1,
        text: content.trim()
      }];

    } catch (error) {
      logger.error('Text parsing error:', error);
      throw new Error(`Text parsing failed: ${error.message}`);
    }
  }

  async saveFile(buffer, originalName) {
    try {
      const timestamp = Date.now();
      const ext = path.extname(originalName);
      const basename = path.basename(originalName, ext);
      const filename = `${basename}_${timestamp}${ext}`;
      const filePath = path.join(this.storageDir, filename);

      await fs.writeFile(filePath, buffer);

      logger.info(`File saved: ${filename}`);
      return {
        filename,
        filePath,
        originalName,
        size: buffer.length,
        savedAt: new Date().toISOString()
      };

    } catch (error) {
      logger.error('File save error:', error);
      throw new Error(`Failed to save file: ${error.message}`);
    }
  }

  async deleteFile(filename) {
    try {
      const filePath = path.join(this.storageDir, filename);
      await fs.unlink(filePath);
      logger.info(`File deleted: ${filename}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error(`Failed to delete file ${filename}:`, error);
        throw error;
      }
    }
  }

  async listFiles() {
    try {
      const files = await fs.readdir(this.storageDir);
      const fileDetails = await Promise.all(
        files.map(async (filename) => {
          try {
            const filePath = path.join(this.storageDir, filename);
            const stats = await fs.stat(filePath);
            return {
              filename,
              size: stats.size,
              modified: stats.mtime.toISOString(),
              extension: path.extname(filename)
            };
          } catch (error) {
            logger.error(`Failed to get stats for ${filename}:`, error);
            return null;
          }
        })
      );

      return fileDetails.filter(file => file !== null);
    } catch (error) {
      logger.error('Failed to list files:', error);
      return [];
    }
  }

  getSupportedMimeTypes() {
    return [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];
  }

  isSupported(mimeType) {
    return this.getSupportedMimeTypes().includes(mimeType);
  }
}

module.exports = new ParserService();