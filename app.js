let DB=null;
let state={
  picked:[],
  answers:{}, // questionId -> answer
  idx:0,
  timer:null,
  endAt:null,
  showPassage:true
};

const $=sel=>document.querySelector(sel);

async function loadDB(){
  const res=await fetch('questions.json');
  DB=await res.json();
  $('#title').textContent = DB.meta.title;
  $('#passageTitle').textContent = `${DB.passage.title_en} / ${DB.passage.title_th}`;
  $('#passageText').innerHTML = DB.passage.paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('');
}

function escapeHtml(s){
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function startQuiz(){
  const numQ = parseInt($('#numQ').value,10);
  const minutes = parseInt($('#minutes').value,10);
  state.showPassage = $('#showPassage').checked;

  const pool = DB.questions;
  const picked = (numQ===999 || numQ>=pool.length) ? shuffle(pool) : shuffle(pool).slice(0,numQ);

  state.picked = picked;
  state.answers = {};
  state.idx = 0;

  // timer
  clearInterval(state.timer);
  state.timer=null;
  state.endAt=null;

  if(minutes>0){
    state.endAt = Date.now() + minutes*60*1000;
    tickTimer();
    state.timer = setInterval(tickTimer, 250);
  }else{
    $('#timer').textContent = 'No timer';
  }

  $('#setup').hidden = true;
  $('#quiz').hidden = false;

  // passage visibility
  $('#passageCard').hidden = !state.showPassage;
  $('#togglePassageBtn').textContent = state.showPassage ? 'Hide passage' : 'Show passage';

  renderQuestion();
  updateNavButtons();
}

function tickTimer(){
  const t = state.endAt - Date.now();
  if(t<=0){
    $('#timer').textContent = 'Time up!';
    clearInterval(state.timer);
    state.timer=null;
    submitQuiz(true);
    return;
  }
  const m = Math.floor(t/60000);
  const s = Math.floor((t%60000)/1000);
  $('#timer').textContent = `Time left: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderQuestion(){
  const q = state.picked[state.idx];
  const qArea = $('#qArea');
  qArea.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'qcard';

  const meta = document.createElement('div');
  meta.className = 'qmeta';
  meta.innerHTML = `<span class="badge">Q ${state.idx+1}/${state.picked.length}</span>
                    <span class="badge">${escapeHtml(q.skill||'')}</span>
                    <span class="badge">${escapeHtml(q.type)}</span>`;
  card.appendChild(meta);

  const prompt = document.createElement('p');
  prompt.className = 'qprompt';
  prompt.textContent = q.prompt;
  card.appendChild(prompt);

  const saved = state.answers[q.id];

  if(q.type==='mcq'){
    const choices = document.createElement('div');
    choices.className = 'choices';
    for(const key of Object.keys(q.choices)){
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type='radio'; input.name='mcq'; input.value=key;
      if(saved===key) input.checked=true;
      input.addEventListener('change', ()=>{
        state.answers[q.id]=key;
        persist();
      });
      const txt = document.createElement('div');
      txt.innerHTML = `<b>${key}.</b> ${escapeHtml(q.choices[key])}`;
      label.appendChild(input);
      label.appendChild(txt);
      choices.appendChild(label);
    }
    card.appendChild(choices);
  }else if(q.type==='classify'){
    const items = q.items;
    const wrap = document.createElement('div');
    wrap.className='choices';
    const note = document.createElement('p');
    note.className='hint';
    note.textContent='Tick items for each bucket. (Simple offline version)';
    wrap.appendChild(note);

    const buckets = q.buckets;
    const current = saved || { [buckets[0]]:[], [buckets[1]]:[] };

    buckets.forEach(bucket=>{
      const section=document.createElement('div');
      section.className='qcard';
      section.style.background='#0b1020';
      const h=document.createElement('div');
      h.className='qmeta';
      h.innerHTML=`<span class="badge">${escapeHtml(bucket)}</span>`;
      section.appendChild(h);

      items.forEach(it=>{
        const lb=document.createElement('label');
        lb.className='choice';
        const cb=document.createElement('input');
        cb.type='checkbox';
        cb.checked = (current[bucket]||[]).includes(it);
        cb.addEventListener('change', ()=>{
          const obj = state.answers[q.id] || { [buckets[0]]:[], [buckets[1]]:[] };
          obj[bucket]=obj[bucket]||[];
          if(cb.checked){
            if(!obj[bucket].includes(it)) obj[bucket].push(it);
          }else{
            obj[bucket]=obj[bucket].filter(x=>x!==it);
          }
          state.answers[q.id]=obj;
          persist();
        });
        const t=document.createElement('div');
        t.textContent=it;
        lb.appendChild(cb); lb.appendChild(t);
        section.appendChild(lb);
      });
      wrap.appendChild(section);
    });

    card.appendChild(wrap);
  }else if(q.type==='insertion'){
    const choices = document.createElement('div');
    choices.className = 'choices';
    const idxSaved = (typeof saved==='number') ? saved : null;

    q.options.forEach((opt, i)=>{
      const label=document.createElement('label');
      label.className='choice';
      const input=document.createElement('input');
      input.type='radio'; input.name='ins'; input.value=String(i+1);
      if(idxSaved===i+1) input.checked=true;
      input.addEventListener('change', ()=>{
        state.answers[q.id]=i+1;
        persist();
      });
      const txt=document.createElement('div');
      txt.innerHTML=`<b>Option ${i+1}.</b> ${escapeHtml(opt)}`;
      label.appendChild(input); label.appendChild(txt);
      choices.appendChild(label);
    });

    card.appendChild(choices);
  }else if(q.type==='short'){
    const ta=document.createElement('textarea');
    ta.placeholder='Write your 3 summary statements here...';
    ta.value = saved || '';
    ta.addEventListener('input', ()=>{
      state.answers[q.id]=ta.value;
      persist();
    });
    card.appendChild(ta);

    const guide=document.createElement('div');
    guide.className='hint';
    guide.innerHTML = '<b>What to include:</b><ul>' + q.answer_guidance.map(x=>`<li>${escapeHtml(x)}</li>`).join('') + '</ul>';
    card.appendChild(guide);
  }

  qArea.appendChild(card);
}

function updateNavButtons(){
  $('#prevBtn').disabled = (state.idx===0);
  $('#nextBtn').disabled = (state.idx===state.picked.length-1);
}

function persist(){
  localStorage.setItem('offline_quiz_state', JSON.stringify({
    pickedIds: state.picked.map(q=>q.id),
    answers: state.answers,
    idx: state.idx,
    endAt: state.endAt,
    showPassage: state.showPassage
  }));
}

function restore(){
  const raw = localStorage.getItem('offline_quiz_state');
  if(!raw) return false;
  try{
    const saved = JSON.parse(raw);
    const idToQ = new Map(DB.questions.map(q=>[q.id,q]));
    const picked = (saved.pickedIds||[]).map(id=>idToQ.get(id)).filter(Boolean);
    if(!picked.length) return false;
    state.picked=picked;
    state.answers=saved.answers||{};
    state.idx=saved.idx||0;
    state.endAt=saved.endAt||null;
    state.showPassage=!!saved.showPassage;

    $('#setup').hidden = true;
    $('#quiz').hidden = false;
    $('#passageCard').hidden = !state.showPassage;
    $('#togglePassageBtn').textContent = state.showPassage ? 'Hide passage' : 'Show passage';

    if(state.endAt && state.endAt>Date.now()){
      tickTimer();
      state.timer=setInterval(tickTimer,250);
    }else{
      $('#timer').textContent = state.endAt ? 'Time up!' : 'No timer';
    }

    renderQuestion();
    updateNavButtons();
    return true;
  }catch(e){
    return false;
  }
}

function scoreAttempt(){
  let correct=0, total=0;
  const details=[];
  for(const q of state.picked){
    total += (q.type==='short') ? 0 : 1; // short answer not auto-scored
    const user = state.answers[q.id];

    let isCorrect=null;
    if(q.type==='mcq'){
      isCorrect = (user===q.answer);
      if(isCorrect) correct++;
    }else if(q.type==='classify'){
      // compare sets exactly
      const ans=q.answer;
      const buckets=q.buckets;
      const u=user||{};
      const norm = arr => (arr||[]).slice().sort();
      const ok = JSON.stringify(norm(u[buckets[0]]))===JSON.stringify(norm(ans[buckets[0]]))
             && JSON.stringify(norm(u[buckets[1]]))===JSON.stringify(norm(ans[buckets[1]]));
      isCorrect = ok;
      if(ok) correct++;
    }else if(q.type==='insertion'){
      isCorrect = (user===q.answer);
      if(isCorrect) correct++;
    }else if(q.type==='short'){
      isCorrect = null; // manual
    }

    details.push({q, user, isCorrect});
  }
  return {correct, total, details};
}

function submitQuiz(auto=false){
  clearInterval(state.timer);
  state.timer=null;

  const {correct,total,details} = scoreAttempt();
  const pct = total>0 ? Math.round((correct/total)*100) : 0;

  $('#quiz').hidden = true;
  $('#result').hidden = false;

  let line = `Auto-scored: ${correct}/${total} (${pct}%)`;
  if(total!==state.picked.length){
    line += ` • Note: Short-answer summary is not auto-scored.`;
  }
  if(auto) line += ' • Submitted automatically when time ended.';
  $('#scoreLine').textContent = line;

  $('#review').hidden = true;
  $('#review').innerHTML = buildReview(details);

  // keep local state so user can review later
  persist();
}

function buildReview(details){
  return details.map((d, i)=>{
    const q=d.q;
    const user=d.user;
    let userText='';
    let correctText='';
    let cls='';
    if(q.type==='mcq'){
      userText = user ? `${user}. ${q.choices[user]||''}` : '(no answer)';
      correctText = `${q.answer}. ${q.choices[q.answer]}`;
      cls = (d.isCorrect===true) ? 'ok' : 'no';
    }else if(q.type==='classify'){
      userText = user ? JSON.stringify(user, null, 2) : '(no answer)';
      correctText = JSON.stringify(q.answer, null, 2);
      cls = (d.isCorrect===true) ? 'ok' : 'no';
    }else if(q.type==='insertion'){
      userText = (typeof user==='number') ? `Option ${user}` : '(no answer)';
      correctText = `Option ${q.answer}`;
      cls = (d.isCorrect===true) ? 'ok' : 'no';
    }else if(q.type==='short'){
      userText = (user && String(user).trim()) ? escapeHtml(String(user)) : '(no answer)';
      correctText = '<ul>' + q.answer_guidance.map(x=>`<li>${escapeHtml(x)}</li>`).join('') + '</ul>';
      cls = '';
    }

    const expl = q.explanation ? `<p class="hint"><b>Explanation:</b> ${escapeHtml(q.explanation)}</p>` : '';
    return `
      <div class="qcard ${cls}">
        <div class="qmeta">
          <span class="badge">Q ${i+1}</span>
          <span class="badge">${escapeHtml(q.skill||'')}</span>
          <span class="badge">${escapeHtml(q.type)}</span>
        </div>
        <p class="qprompt">${escapeHtml(q.prompt)}</p>
        <p><b>Your answer:</b> <pre style="white-space:pre-wrap;margin:6px 0">${userText}</pre></p>
        <p><b>Correct:</b> <pre style="white-space:pre-wrap;margin:6px 0">${correctText}</pre></p>
        ${expl}
      </div>
    `;
  }).join('');
}

$('#startBtn')?.addEventListener('click', startQuiz);
$('#prevBtn')?.addEventListener('click', ()=>{
  if(state.idx>0){ state.idx--; persist(); renderQuestion(); updateNavButtons(); }
});
$('#nextBtn')?.addEventListener('click', ()=>{
  if(state.idx<state.picked.length-1){ state.idx++; persist(); renderQuestion(); updateNavButtons(); }
});
$('#submitBtn')?.addEventListener('click', ()=>submitQuiz(false));
$('#restartBtn')?.addEventListener('click', ()=>{
  localStorage.removeItem('offline_quiz_state');
  location.reload();
});
$('#reviewBtn')?.addEventListener('click', ()=>{
  const r=$('#review');
  r.hidden = !r.hidden;
});
$('#togglePassageBtn')?.addEventListener('click', ()=>{
  const card=$('#passageCard');
  if(card.hidden){
    card.hidden=false;
    $('#togglePassageBtn').textContent='Hide passage';
    state.showPassage=true;
  }else{
    card.hidden=true;
    $('#togglePassageBtn').textContent='Show passage';
    state.showPassage=false;
  }
  persist();
});

(async function(){
  await loadDB();
  // Offer restore if any
  restore();
})();
