
import { Router } from 'express';
import { generateLLM } from '../services/llm.js';
import { retrieveSnippets, ragEnabled } from '../services/rag.js';

const router = Router();

router.post('/', async (req, res) => {
  try{
    const { message, model, history } = req.body || {};
    if(!message){
      return res.status(400).json({ error: { code:'BAD_REQUEST', message:'message 필드는 필수입니다.' } });
    }
    
    // RAG 검색 (업로드된 문서 기반)
    let snippets = [];
    if(ragEnabled()){
      try{ 
        snippets = await retrieveSnippets({ query: message, topK: 5 }); 
      }catch(err){
        console.warn('RAG 검색 실패:', err.message);
      }
    }
    
    const text = await generateLLM({ message, history, userModel: model, snippets });
    res.json({ response: text });
  }catch(e){
    res.status(500).json({ error: { code:'UPSTREAM_ERROR', message: e?.message || '모델 호출 중 오류가 발생했습니다.' } });
  }
});

export default router;
