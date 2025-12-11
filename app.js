/* app.js - Mentallify frontend logic (chat + self-check + offline fallbacks)
   Floating chatbot behavior removed; chat now behaves inline in the layout.
*/

/* ------------- Configuration ------------- */
const API_BASE_URL = ''; // same origin by default

/* ------------- Utility DOM helpers ------------- */
const messages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const startQuizButton = document.getElementById('start-quiz-button');

function appendMessage(text, sender='bot', opts={}) {
  const el = document.createElement('div');
  el.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
  el.textContent = text;
  if (opts.id) el.id = opts.id;
  (document.getElementById('chat-messages') || document.body).appendChild(el);
  const m = document.getElementById('chat-messages');
  if (m) { m.scrollTop = m.scrollHeight; }
  return el;
}
function appendHtmlMessage(html, sender='bot', opts={}) {
  const el = document.createElement('div');
  el.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
  el.innerHTML = html;
  if (opts.id) el.id = opts.id;
  (document.getElementById('chat-messages') || document.body).appendChild(el);
  const m = document.getElementById('chat-messages');
  if (m) { m.scrollTop = m.scrollHeight; }
  return el;
}

/* ------------- Local keyword fallback ------------- */
function localFallbackReply(message) {
  const msg = (message||"").toLowerCase();
  const depression = ['sad','depress','hopeless','empty','guilty','worthless','tired','suicid'];
  const anxiety = ['anxious','worried','panic','nervous','tense','restless','heart','sweat'];
  const bipolar = ['manic','euphor','racing','impulsive','mood swing','euphoric'];
  const ptsd = ['trauma','flashback','nightmare','trigger','startle'];
  const ocd = ['obsess','compuls','ritual','check','clean'];
  const schizo = ['hallucinat','delusion','paranoid','voices','disorgan'];

  let matches = [];
  if (depression.some(k => msg.includes(k))) matches.push('Depression');
  if (anxiety.some(k => msg.includes(k))) matches.push('Anxiety');
  if (bipolar.some(k => msg.includes(k))) matches.push('Bipolar Disorder');
  if (ptsd.some(k => msg.includes(k))) matches.push('PTSD');
  if (ocd.some(k => msg.includes(k))) matches.push('OCD');
  if (schizo.some(k => msg.includes(k))) matches.push('Schizophrenia');

  if (matches.length === 0) {
    return "Thanks for sharing — could you tell me whether this affects sleep, appetite, mood, or daily activities?";
  }

  let resp = "Based on your description, you might have symptoms related to: " + matches.join(', ') + ".\n\nGeneral suggestions:\n";
  if (matches.includes('Depression')) resp += "• Depression: consider therapy, staying active, keeping social contact, and seeking professional advice.\n";
  if (matches.includes('Anxiety')) resp += "• Anxiety: try breathing, grounding (5-4-3-2-1), regular sleep, and limiting caffeine.\n";
  if (matches.includes('Bipolar Disorder')) resp += "• Bipolar: keep routine, sleep hygiene, avoid substances, seek psychiatric care when needed.\n";
  if (matches.includes('PTSD')) resp += "• PTSD: consider trauma-focused therapy and supportive services.\n";
  if (matches.includes('OCD')) resp += "• OCD: exposure and response prevention therapy (ERP) and professional guidance.\n";
  if (matches.includes('Schizophrenia')) resp += "• Schizophrenia: professional assessment and medication/support networks.\n";

  resp += "\nThis is informational only — please consult a healthcare professional for diagnosis and treatment.";
  return resp;
}

/* ------------- Quiz state ------------- */
const quiz = { active:false, questions:[], idx:0, yesSymptoms:[], progressEl:null, progressBarEl:null, progressMsgEl:null };

/* ---------- Progress UI (circular ring card) ---------- */
function attachProgressBar(total) {
  // remove old if exists
  const existing = document.getElementById('quiz-progress-wrap');
  if (existing) existing.remove();

  // build SVG gradient + ring markup (inline for easy injection)
  const html = `
    <div id="quiz-progress-wrap" class="message bot-message" style="display:flex;">
      <div class="quiz-progress-card" role="group" aria-label="Self-check progress">
        <div class="progress-ring" aria-hidden="true">
          <svg viewBox="0 0 120 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
            <defs>
              <linearGradient id="quiz-grad" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stop-color="#7c3aed"/>
                <stop offset="60%" stop-color="#ff2ec4"/>
                <stop offset="100%" stop-color="#ff7ab6"/>
              </linearGradient>
            </defs>
            <circle class="ring-bg" cx="60" cy="60" r="52"></circle>
            <circle class="ring-fg" cx="60" cy="60" r="52"></circle>
          </svg>
          <div class="ring-text"><span id="quiz-ring-count">0</span>/<span id="quiz-ring-total">${total}</span></div>
        </div>

        <div class="progress-card-info">
          <div class="title">Self-check progress</div>
          <div class="sub">Answer honestly — this helps produce more accurate suggestions.</div>
        </div>
      </div>
    </div>
  `;
  // append as bot message
  const wrapEl = appendHtmlMessage(html, 'bot', { id: 'quiz-progress-wrap' });

  // cache elements
  quiz.progressBarEl = wrapEl.querySelector('.ring-fg'); // SVG circle element
  quiz.progressMsgEl = wrapEl.querySelector('#quiz-ring-count');
  quiz.progressTotal = total;

  // prepare stroke lengths (circle r=52 => circumference = 2πr)
  setTimeout(() => {
    try {
      const fg = quiz.progressBarEl;
      const r = Number(fg.getAttribute('r') || 52);
      const circumference = 2 * Math.PI * r;
      fg.style.strokeDasharray = circumference;
      fg.style.strokeDashoffset = circumference; // start at 0%
      fg._circumference = circumference;
    } catch (e) {
      // ignore if any issue (fallback to linear bar)
    }
  }, 30);
}

function updateProgress(total) {
  if (!quiz.progressBarEl || !quiz.progressMsgEl) return;
  const completed = Math.min(quiz.idx, total);
  const percent = Math.round((completed / total) * 100);
  // update numeric
  quiz.progressMsgEl.textContent = `${completed}`;

  // update ring by changing strokeDashoffset
  try {
    const fg = quiz.progressBarEl;
    const circ = fg._circumference || (parseFloat(fg.getAttribute('r') || 52) * 2 * Math.PI);
    const offset = Math.max(0, Math.round(circ * (1 - (completed / total))));
    fg.style.strokeDashoffset = offset;
  } catch (e) {
    // fallback silently
  }

  // if completed == total, add a pulse to the ring and small highlight
  if (completed >= total) {
    const ringWrap = document.querySelector('.progress-ring');
    if (ringWrap) {
      ringWrap.classList.add('ring-pulse');
      setTimeout(()=> ringWrap.classList.remove('ring-pulse'), 900);
    }
  }
}

function removeProgressBar() {
  const el = document.getElementById('quiz-progress-wrap');
  if (el) el.remove();
  quiz.progressBarEl = null;
  quiz.progressMsgEl = null;
  quiz.progressTotal = null;
}

/* ---------- Confetti utility ---------- */
function triggerConfetti(originX = window.innerWidth/2, originY = window.innerHeight/3, count = 18) {
  const colors = ['#7c3aed','#ff2ec4','#ff7ab6','#6ee7b7','#ffd166'];
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '100%';
  container.style.height = '100%';
  container.style.pointerEvents = 'none';
  container.style.zIndex = 2200;
  document.body.appendChild(container);

  for (let i=0;i<count;i++){
    const d = document.createElement('div');
    d.className = 'confetti-dot';
    const size = 6 + Math.round(Math.random()*10);
    d.style.width = size+'px';
    d.style.height = (size-2)+'px';
    d.style.left = (originX + (Math.random()-0.5)*180) + 'px';
    d.style.top = (originY + (Math.random()-0.5)*40) + 'px';
    d.style.background = colors[Math.floor(Math.random()*colors.length)];
    d.style.opacity = '1';
    container.appendChild(d);

    // animate: random angle and velocity
    const angle = (Math.random()*120 - 60) * (Math.PI/180);
    const velocity = 220 + Math.random()*240;
    const vx = Math.cos(angle) * velocity;
    const vy = -Math.abs(Math.sin(angle) * velocity) - 80;
    const rot = (Math.random()*720 - 360);

    // animate using requestAnimationFrame for smoother effect
    const duration = 1000 + Math.random()*700;
    const start = performance.now();
    function frame(t) {
      const dt = t - start;
      const progress = Math.min(1, dt / duration);
      // simple physics: x = x0 + vx * t * 0.001, y = y0 + vy*t*0.001 + 0.5*g*t^2
      const g = 620; // stronger gravity
      const x = (originX + (Math.random()-0.5)*180) + vx * (dt/1000);
      const y = (originY + (Math.random()-0.5)*40) + vy * (dt/1000) + 0.5 * g * Math.pow(dt/1000, 2);
      d.style.transform = `translate(${x - originX}px, ${y - originY}px) rotate(${rot * progress}deg)`;
      d.style.opacity = String(1 - progress);
      if (progress < 1) requestAnimationFrame(frame);
      else {
        // fade out then remove
        d.style.transition = 'opacity 400ms ease';
        d.style.opacity = '0';
        setTimeout(()=> d.remove(), 450);
      }
    }
    requestAnimationFrame(frame);
  }

  // remove container after a while
  setTimeout(()=> {
    container.remove();
  }, 2200);
}

/* ------------- Quiz flow (same as before) ------------- */
async function startQuiz(numQuestions=12) {
  try {
    const res = await fetch(`${API_BASE_URL || ''}/quiz_questions?n=${numQuestions}`);
    if (!res.ok) throw new Error('Failed to load questions from server');
    const data = await res.json();
    quiz.questions = data.questions || [];
  } catch (err) {
    quiz.questions = [
      {"text":"Have you been feeling sad or down recently?","symptom_key":"feeling sad"},
      {"text":"Have you lost interest in activities you usually enjoy?","symptom_key":"loss of interest"},
      {"text":"Have you been feeling unusually worried or anxious?","symptom_key":"excessive worry"},
      {"text":"Are you having trouble sleeping or sleeping much more?","symptom_key":"sleep disturbance"},
      {"text":"Have you experienced panic attacks?","symptom_key":"panic attacks"},
      {"text":"Have you noticed changes in appetite or weight?","symptom_key":"appetite change"},
      {"text":"Have you had difficulty concentrating?","symptom_key":"concentration problems"},
      {"text":"Do you feel restless or slowed down?","symptom_key":"psychomotor change"},
      {"text":"Have you experienced intrusive thoughts or images?","symptom_key":"intrusive thoughts"},
      {"text":"Have you had unusual sensory experiences (hearing/seeing things)?","symptom_key":"hallucination like"},
      {"text":"Have you been avoiding reminders of a distressing event?","symptom_key":"avoidance"},
      {"text":"Have you been having repetitive behaviors you can't control?","symptom_key":"compulsions"}
    ].slice(0, numQuestions);
  }

  quiz.idx=0; quiz.yesSymptoms=[]; quiz.active=true;
  appendMessage("Let's do a quick self-check. I'll ask a few yes/no questions.", 'bot');
  attachProgressBar(quiz.questions.length);
  updateProgress(quiz.questions.length);
  askNextQuizQuestion();
}

function askNextQuizQuestion() {
  if (!quiz.active) return;
  if (quiz.idx >= quiz.questions.length) {
    appendMessage("That's all. Tap Finish to see results or type 'Finish'.", 'bot');
    showQuizFinishButtons();
    updateProgress(quiz.questions.length);
    return;
  }
  const q = quiz.questions[quiz.idx];
  appendMessage(q.text, 'bot');
  showQuickReplies();
  updateProgress(quiz.questions.length);
}

function showQuickReplies() {
  const html = `<div class="quick-replies">
    <button class="yes" id="qr-yes">Yes</button>
    <button class="no" id="qr-no">No</button>
  </div>`;
  const wrapper = appendHtmlMessage(html, 'bot');
  setTimeout(()=> {
    const yesBtn = document.getElementById('qr-yes');
    const noBtn = document.getElementById('qr-no');
    if (yesBtn) yesBtn.addEventListener('click', () => {
      wrapper.remove();
      appendMessage('yes','user');
      quizAnswerYes();
    });
    if (noBtn) noBtn.addEventListener('click', () => {
      wrapper.remove();
      appendMessage('no','user');
      quizAnswerNo();
    });
  }, 20);
}

function quizAnswerYes() { if (!quiz.active) return; const q=quiz.questions[quiz.idx]; if(q&&q.symptom_key) quiz.yesSymptoms.push(q.symptom_key); quiz.idx++; updateProgress(quiz.questions.length); askNextQuizQuestion(); }
function quizAnswerNo() { if (!quiz.active) return; quiz.idx++; updateProgress(quiz.questions.length); askNextQuizQuestion(); }

function showQuizFinishButtons() {
  document.querySelectorAll('.quiz-finish').forEach(el=>el.remove());
  const html = `<div class="quiz-finish" style="margin-top:8px;">
    You can finish the self-check now.<br/>
    <button class="quiz-finish-btn" data-action="finish" style="margin:6px 6px 0 0;padding:8px 12px;border-radius:8px;background:#2c7fb8;color:#fff;border:none;">Finish</button>
    <button class="quiz-finish-btn" data-action="restart" style="margin:6px 6px 0 0;padding:8px 12px;border-radius:8px;background:#e8f4fc;color:#15324b;border:1px solid #d7eefc;">Restart</button>
  </div>`;
  appendHtmlMessage(html, 'bot');
}

async function submitQuizAnswers() {
  const finishBtn = document.querySelector('.quiz-finish-btn[data-action="finish"]');
  if (finishBtn) finishBtn.disabled = true;
  appendMessage("Checking results...", 'bot');

  try {
    const res = await fetch(`${API_BASE_URL || ''}/quiz_result`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ yes_symptoms: quiz.yesSymptoms })
    });
    if (!res.ok) { appendMessage("Sorry — couldn't fetch results. Showing client-side suggestions.", 'bot'); clientSideQuizResults(); return; }
    const data = await res.json();
    const results = data.results || [];
    document.querySelectorAll('.quiz-finish').forEach(el=>el.remove());

    // celebration + pulse
    try {
      const ring = document.querySelector('.progress-ring');
      const rect = ring ? ring.getBoundingClientRect() : null;
      const originX = rect ? rect.left + rect.width/2 : window.innerWidth/2;
      const originY = rect ? rect.top + rect.height/2 : window.innerHeight/3;
      triggerConfetti(originX, originY, 22);
    } catch(e){ /* ignore */ }

    removeProgressBar();
    displayResultsAsCards(results);
  } catch (err) {
    console.error(err);
    appendMessage("Error getting results. Showing client-side suggestions.", 'bot');
    clientSideQuizResults();
  } finally {
    quiz.active=false; quiz.questions=[]; quiz.idx=0; quiz.yesSymptoms=[];
  }
}

function clientSideQuizResults() {
  const diseaseMap = {
    "Depression": ["feeling sad","loss of interest","sleep disturbance","appetite change","concentration problems"],
    "Anxiety": ["excessive worry","panic attacks","restless","sleep disturbance"],
    "PTSD": ["intrusive thoughts","avoidance","nightmare","flashback"],
    "OCD": ["compulsions","intrusive thoughts","repeat"],
    "Schizophrenia": ["hallucination like","withdrawn","disorganized"]
  };
  const results = Object.entries(diseaseMap).map(([d,symps]) => {
    const matched = symps.filter(s => quiz.yesSymptoms.includes(s));
    const score = symps.length ? (matched.length/symps.length) : 0;
    return { disease: d, score: Number(score.toFixed(3)), matched_symptoms: matched, precautions: "" };
  }).sort((a,b)=>b.score-a.score);
  displayResultsAsCards(results);
}

/* ------------- Render results UI ------------- */
function displayResultsAsCards(results) {
  removeProgressBar();
  if (!results || results.length === 0) {
    appendMessage("No likely matches were found. Consider sharing more details in chat.", 'bot');
    return;
  }
  const container = document.createElement('div'); container.className='result-cards';
  results.slice(0,3).forEach(r => {
    const card = document.createElement('div'); card.className='result-card';
    const title = document.createElement('h4'); title.textContent = r.disease; card.appendChild(title);
    const score = document.createElement('div'); score.className='score'; score.textContent = `Score: ${Number(r.score).toFixed(3)}`; card.appendChild(score);
    const matchedWrap = document.createElement('div');
    if (r.matched_symptoms && r.matched_symptoms.length>0) {
      r.matched_symptoms.forEach(s => { const pill = document.createElement('span'); pill.className='symptom-pill'; pill.textContent=s; matchedWrap.appendChild(pill); });
    } else {
      const p=document.createElement('div'); p.style.color='var(--muted)'; p.textContent='No direct symptom matches captured.'; matchedWrap.appendChild(p);
    }
    card.appendChild(matchedWrap);
    const prec = document.createElement('div'); prec.className='precautions'; prec.innerHTML = `<strong>Precautions / suggested steps:</strong><br/>${r.precautions||'See resources and consider professional consultation.'}`; card.appendChild(prec);
    const linkWrap = document.createElement('div'); linkWrap.style.marginTop='8px'; linkWrap.innerHTML = `<a href="/disorders.html" style="color:var(--primary); text-decoration:underline;">View similar disorders & resources</a>`; card.appendChild(linkWrap);
    container.appendChild(card);
  });
  const wrapper = document.createElement('div'); wrapper.className='message bot-message'; wrapper.appendChild(container); const mm = document.getElementById('chat-messages'); if(mm) { mm.appendChild(wrapper); mm.scrollTop = mm.scrollHeight; } else document.body.appendChild(wrapper);
}

/* ------------- Chat flow (server + fallback) ------------- */
async function sendMessageToServer(text) {
  const mm = document.getElementById('chat-messages');
  const typing = document.createElement('div'); typing.className='message bot-message'; typing.textContent='...';
  if (mm) mm.appendChild(typing);
  try {
    const res = await fetch(`${API_BASE_URL || ''}/chat`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ message: text })
    });
    if (mm) typing.remove();
    if (!res.ok) {
      const fallback = localFallbackReply(text);
      appendMessage(fallback, 'bot');
      maybeAutoStartQuiz(fallback);
      return;
    }
    const data = await res.json();
    const reply = data && data.reply ? String(data.reply) : localFallbackReply(text);
    appendMessage(reply, 'bot');
    maybeAutoStartQuiz(reply);
  } catch (err) {
    if (mm) typing.remove();
    console.error('Chat send error', err);
    const fallback = localFallbackReply(text);
    appendMessage(fallback, 'bot');
    maybeAutoStartQuiz(fallback);
  }
}

/* ------------- Auto-start quiz detection ------------- */
function maybeAutoStartQuiz(replyText) {
  if (quiz.active) return;
  if (!replyText) return;
  // normalise text (strip HTML tags if present)
  const plain = replyText.replace(/<[^>]*>/g,'');
  const trigger = /could you tell me whether this affects|does this affect your|please tell me whether this affects|affects sleep/i;
  if (trigger.test(plain)) {
    setTimeout(()=> startQuiz(12), 700);
  }
}

/* ------------- UI interactions ------------- */
function handleSend() {
  const inputEl = document.getElementById('user-input');
  const text = (inputEl && inputEl.value || '').trim();
  if (!text) return;
  appendMessage(text, 'user');
  if (inputEl) inputEl.value='';

  const t = text.toLowerCase();
  if (!quiz.active && (t==='self-check' || t==='start self-check' || t==='start quiz' || t==='self check')) { startQuiz(12); return; }
  if (quiz.active) {
    if (/\b(y(es|eah|yeah|y))\b/i.test(t)) { quizAnswerYes(); return; }
    if (/\b(no|nah|n)\b/i.test(t)) { quizAnswerNo(); return; }
    const positiveWords = ['yes','have','experienc','i do','i am','sometimes','affects'];
    const negativeWords = ['no','not','dont','do not','never','none','nope','doesn\'t'];
    let pos = positiveWords.some(w => t.includes(w));
    let neg = negativeWords.some(w => t.includes(w));
    if (pos && !neg) { quizAnswerYes(); return; }
    if (neg && !pos) { quizAnswerNo(); return; }
    appendMessage("Please answer 'Yes' or 'No' for the current question (or click the quick buttons).", 'bot');
    return;
  }
  sendMessageToServer(text);
}

document.addEventListener('click', function(ev){
  if (ev.target && ev.target.id === 'send-btn' || ev.target.closest && ev.target.closest('#send-btn')) {
    handleSend();
  }
});
document.addEventListener('keydown', function(e){ if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'user-input') { handleSend(); } });

/* delegated finish/restart handlers */
document.addEventListener('click', function (ev) {
  const btn = ev.target.closest && ev.target.closest('.quiz-finish-btn');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  if (action==='finish') { btn.disabled = true; submitQuizAnswers(); }
  else if (action==='restart') { document.querySelectorAll('.quiz-finish').forEach(el=>el.remove()); removeProgressBar(); setTimeout(()=> startQuiz(12), 250); }
});

/* start quiz via hero button */
const sqb = document.getElementById('start-quiz-button');
if (sqb) sqb.addEventListener('click', (e)=> { e.preventDefault(); const c = document.getElementById('chatbot'); c && c.scrollIntoView({behavior:'smooth', block:'center'}); startQuiz(12); });

/* focus */
if (userInput) { userInput.setAttribute('aria-label','Message input'); userInput.focus(); }

/* ------------- Contact form demo behavior (for contact.html) ------------- */
document.addEventListener('DOMContentLoaded', ()=> {
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const toast = document.getElementById('contact-toast');
      if (toast) {
        toast.style.display='block';
        toast.textContent = 'Demo only: messages are not sent. For help email info@mentallify.org';
        setTimeout(()=> toast.style.display='none', 6000);
      }
    });
  }

  // mobile nav toggle
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.querySelector('nav ul');
  navToggle && navToggle.addEventListener('click', () => {
    mainNav.classList.toggle('show');
    navToggle.setAttribute('aria-expanded', mainNav.classList.contains('show') ? 'true' : 'false');
  });

  // NOTE: floating/chat-toggle behavior removed intentionally.
});

/* ------------- Optional: attempt to load browser model (vocab + web_model.json) ------------- */
async function tryLoadBrowserModel() {
  try {
    const [vocabRes, modelRes] = await Promise.all([
      fetch('/models/vocab.json').catch(()=>null),
      fetch('/models/web_model.json').catch(()=>null)
    ]);
    if (!vocabRes || !modelRes || !vocabRes.ok || !modelRes.ok) return null;
    const vocab = await vocabRes.json();
    const webModel = await modelRes.json();
    return { vocab, webModel };
  } catch(e) {
    console.warn('browser model load failed', e);
    return null;
  }
}

// expose for debug
window.Mentallify = window.Mentallify || {};
window.Mentallify.startQuiz = startQuiz;
window.Mentallify.tryLoadBrowserModel = tryLoadBrowserModel;
window.Mentallify.localFallbackReply = localFallbackReply;
