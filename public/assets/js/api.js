
window.API = {
  async chat(payload){
    const res = await fetch('/api/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(!res.ok){ throw new Error('HTTP '+res.status); }
    return res.json();
  },

  async uploadFile(file){
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });
    if(!res.ok){ 
      const err = await res.json().catch(()=>({error:{message:'업로드 실패'}}));
      throw new Error(err.error?.message || 'Upload failed'); 
    }
    return res.json();
  },

  async deleteFile(filename){
    const res = await fetch('/api/upload/' + encodeURIComponent(filename), {
      method: 'DELETE'
    });
    if(!res.ok){ throw new Error('HTTP '+res.status); }
    return res.json();
  },

  async listFiles(){
    const res = await fetch('/api/upload');
    if(!res.ok){ throw new Error('HTTP '+res.status); }
    return res.json();
  }
};
