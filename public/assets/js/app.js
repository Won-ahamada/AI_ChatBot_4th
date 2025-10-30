
(() => {
  const $ = (s) => document.querySelector(s);
  const messages = $("#messages");
  const text = $("#text");
  const send = $("#send");
  const modelSel = $("#model");
  const errorBanner = $("#error");
  const dropzone = $("#dropzone");
  const fileInput = $("#fileInput");
  const fileList = $("#files");

  // Client-only Sliding Window (reset on refresh)
  const history = [];
  const MAX_TURNS = 8;

  function showError(msg){
    errorBanner.textContent = msg;
    errorBanner.classList.add('show');
    setTimeout(()=> errorBanner.classList.remove('show'), 4000);
  }

  function formatFileSize(bytes){
    if(bytes < 1024) return bytes + ' B';
    if(bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    return (bytes/(1024*1024)).toFixed(1) + ' MB';
  }

  async function loadFiles(){
    try {
      const data = await window.API.listFiles();
      fileList.innerHTML = '';
      if(!data.files || data.files.length === 0){
        fileList.innerHTML = '<li style="opacity:.7;font-size:.85rem;padding:8px;">업로드된 문서가 없습니다</li>';
        return;
      }
      data.files.forEach(file => {
        const li = document.createElement('li');
        li.className = 'file-item success';
        li.innerHTML = `
          <div class="file-info">
            <div class="file-name">${file.name || file.filename}</div>
            <div class="file-size">${formatFileSize(file.size || 0)}</div>
          </div>
          <button class="file-remove" data-file="${file.name || file.filename}">삭제</button>
        `;
        fileList.appendChild(li);
      });

      // 삭제 버튼 이벤트
      fileList.querySelectorAll('.file-remove').forEach(btn => {
        btn.addEventListener('click', async (e)=>{
          const filename = e.target.dataset.file;
          if(!confirm(`"${filename}"을(를) 삭제하시겠습니까?`)) return;
          try{
            await window.API.deleteFile(filename);
            loadFiles();
          }catch(err){
            showError('파일 삭제 실패: ' + err.message);
          }
        });
      });
    } catch(e){
      console.error('파일 목록 로드 실패:', e);
    }
  }

  async function uploadFile(file){
    const li = document.createElement('li');
    li.className = 'file-item uploading';
    li.innerHTML = `
      <div class="file-info">
        <div class="file-name">${file.name}</div>
        <div class="file-size">업로드 중...</div>
      </div>
    `;
    fileList.appendChild(li);

    try{
      await window.API.uploadFile(file);
      loadFiles();
    }catch(err){
      showError('업로드 실패: ' + err.message);
      li.remove();
    }
  }

  // 드래그 앤 드롭 이벤트
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, (e)=>{
      e.preventDefault();
      e.stopPropagation();
    });
  });

  ['dragenter', 'dragover'].forEach(evt => {
    dropzone.addEventListener(evt, ()=> dropzone.classList.add('dragover'));
  });

  ['dragleave', 'drop'].forEach(evt => {
    dropzone.addEventListener(evt, ()=> dropzone.classList.remove('dragover'));
  });

  dropzone.addEventListener('drop', (e)=>{
    const files = e.dataTransfer.files;
    [...files].forEach(file => uploadFile(file));
  });

  dropzone.addEventListener('click', ()=> fileInput.click());

  fileInput.addEventListener('change', (e)=>{
    [...e.target.files].forEach(file => uploadFile(file));
    e.target.value = '';
  });

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

  loadFiles();
})();
