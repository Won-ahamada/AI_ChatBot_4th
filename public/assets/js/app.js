
(() => {
  const $ = (s) => document.querySelector(s);
  const messages = $("#messages");
  const text = $("#text");
  const send = $("#send");
  const modelSel = $("#model");
  const noticeList = $("#noticeList");
  const errorBanner = $("#error");

  // Client-only Sliding Window (reset on refresh)
  const history = [];
  const MAX_TURNS = 8;

  function showError(msg){
    errorBanner.textContent = msg;
    errorBanner.classList.add('show');
    setTimeout(()=> errorBanner.classList.remove('show'), 3000);
  }

  async function loadNotices(){
    try {
      const res = await fetch('/api/news');
      const data = await res.json();
      noticeList.innerHTML = '';
      (data || []).forEach(item => {
        const li = document.createElement('li');
        li.className = 'notice';
        li.innerHTML = `<div class="date">${item.date || ''}</div><div class="title">${item.title || ''}</div>`;
        noticeList.appendChild(li);
      });
      if(!noticeList.children.length){
        const li = document.createElement('li'); li.className='notice'; li.textContent='표시할 안내사항이 없습니다.'; noticeList.appendChild(li);
      }
    } catch(e){
      const li = document.createElement('li'); li.className='notice'; li.textContent='안내를 불러오지 못했습니다.'; noticeList.appendChild(li);
    }
  }

  function renderMarkdown(text){
    // minimal markdown: **bold**, *italic*, `code`
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`(.+?)`/g,'<code>$1</code>')
      .replace(/\n/g,'<br/>');
  }

  function addMessage(role, content, withLabel=false){
    const wrap = document.createElement('div');
    wrap.className = `message ${role}`;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = role === 'user' ? '사용자' : '응답';
    const body = document.createElement('div');
    body.className = 'md';
    body.innerHTML = renderMarkdown(content);
    if(withLabel) wrap.appendChild(label);
    wrap.appendChild(body);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function addTyping(){
    const wrap = document.createElement('div');
    wrap.className = 'typing';
    wrap.setAttribute('data-typing','1');
    wrap.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    return wrap;
  }

  async function onSend(){
    const content = text.value.trim();
    if(!content) return;
    if(send.disabled) return;
    send.disabled = true;
    errorBanner.classList.remove('show');

    addMessage('user', content, true);
    history.push({ role:'user', content });
    if(history.length > MAX_TURNS*2){ history.splice(0, history.length - MAX_TURNS*2); }

    text.value='';
    const model = modelSel.value;

    const typing = addTyping();

    try{
      const res = await window.API.chat({ message: content, model, history });
      typing.remove();
      addMessage('ai', res.response || '(응답이 비어있습니다)', true);
      history.push({ role:'assistant', content: res.response || '' });
      if(history.length > MAX_TURNS*2){ history.splice(0, history.length - MAX_TURNS*2); }
    }catch(e){
      typing.remove();
      showError('오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      addMessage('ai', '오류가 발생했습니다. 잠시 후 다시 시도해주세요.', true);
    }finally{
      send.disabled = false;
      setTimeout(()=>{ document.activeElement?.scrollIntoView?.({block:'end', behavior:'smooth'}); }, 30);
    }
  }

  send.addEventListener('click', onSend);
  text.addEventListener('keypress', (e)=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); onSend(); }
  });
  text.addEventListener('focus', ()=>{
    setTimeout(()=>document.activeElement.scrollIntoView({block:'end', behavior:'smooth'}), 50);
  });

  loadNotices();
})();
