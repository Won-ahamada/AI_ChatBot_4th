
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/', (req, res) => {
  const fp = path.join(__dirname, '..', '..', 'public', 'notices', 'news.json');
  try{
    const txt = fs.readFileSync(fp, 'utf-8');
    const data = JSON.parse(txt);
    res.json(data);
  }catch(e){
    res.status(200).json([]);
  }
});

export default router;
