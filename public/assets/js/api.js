
window.API = {
  async chat(payload){
    const res = await fetch('/api/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if(!res.ok){ throw new Error('HTTP '+res.status); }
    return res.json();
  }
};
