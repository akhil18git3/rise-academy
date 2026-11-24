(function () {
  var cfg = window.RISE_CONFIG || {};
  var $ = function (id) { return document.getElementById(id); };
  function show(id, on) { $(id).hidden = !on; }

  if (!cfg.url || !cfg.anonKey) { show('setup', true); return; }
  var sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  var STATUSES = ['All', 'Paid', 'Partial', 'Pending', 'Overdue'];
  var rowsData = [], filter = 'All', payingFee = null;

  function inr(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function today() { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
  function el(tag, text, cls) { var e = document.createElement(tag); if (text !== undefined && text !== null) e.textContent = text; if (cls) e.className = cls; return e; }
  function setMsg(id, text, kind) { var m = $(id); m.textContent = text || ''; m.className = 'msg' + (kind ? ' ' + kind : ''); }
  function friendly(err) { return (err && err.message) ? err.message : 'Something went wrong. Please try again.'; }

  // ---------- Session / access ----------
  async function start() {
    var res = await sb.auth.getSession();
    if (res.data.session) { await enter(res.data.session.user); } else { show('login', true); show('app', false); }
  }

  async function enter(user) {
    // Being logged in is not enough: the user must be on the admins list.
    var r = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (r.error || !r.data) {
      await sb.auth.signOut();
      show('app', false); show('login', true);
      setMsg('loginMsg', 'This account is not authorised for admin access.', 'err');
      return;
    }
    $('whoEmail').textContent = user.email || '';
    show('login', false); show('app', true);
    await loadData();
  }

  $('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('loginBtn'); btn.disabled = true; setMsg('loginMsg', 'Signing in…');
    var r = await sb.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    btn.disabled = false;
    if (r.error) { setMsg('loginMsg', 'Sign-in failed. Check your email and password.', 'err'); return; }
    $('password').value = ''; setMsg('loginMsg', '');
    await enter(r.data.user);
  });

  $('logoutBtn').addEventListener('click', async function () {
    await sb.auth.signOut();
    rowsData = []; $('rows').textContent = '';
    show('app', false); show('login', true);
  });

  // ---------- Data ----------
  async function loadData() {
    setMsg('appMsg', 'Loading…');
    var r = await sb.from('fee_status').select('*').order('student_code');
    if (r.error) { setMsg('appMsg', 'Could not load records: ' + friendly(r.error), 'err'); return; }
    setMsg('appMsg', '');
    rowsData = r.data || [];
    render();
  }

  function render() {
    var term = $('q').value.trim().toLowerCase();
    var list = rowsData.filter(function (s) {
      var hay = [s.student_code, s.name, s.course, s.phone].join(' ').toLowerCase();
      return (!term || hay.indexOf(term) > -1) && (filter === 'All' || s.fee_status === filter);
    });
    var tb = $('rows'); tb.textContent = '';
    list.forEach(function (s) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', s.student_code));
      tr.appendChild(el('td', s.name));
      tr.appendChild(el('td', s.course));
      tr.appendChild(el('td', s.phone));
      tr.appendChild(el('td', inr(s.course_fee), 'num'));
      tr.appendChild(el('td', inr(s.paid), 'num'));
      tr.appendChild(el('td', inr(s.balance), 'num'));
      tr.appendChild(el('td', s.due_date));
      var tdS = document.createElement('td'); tdS.appendChild(el('span', s.fee_status, 'badge ' + s.fee_status)); tr.appendChild(tdS);
      var tdA = document.createElement('td');
      if (Number(s.balance) > 0) {
        var b = el('button', 'Add payment', 'btn sm'); b.type = 'button';
        b.addEventListener('click', function () { openPay(s); });
        tdA.appendChild(b);
      }
      tr.appendChild(tdA);
      tb.appendChild(tr);
    });
    $('empty').hidden = list.length > 0;

    var total = 0, paid = 0, over = 0;
    rowsData.forEach(function (s) { total += Number(s.course_fee); paid += Number(s.paid); if (s.fee_status === 'Overdue') over++; });
    $('sTotal').textContent = inr(total); $('sPaid').textContent = inr(paid);
    $('sBal').textContent = inr(total - paid); $('sOver').textContent = over;
  }

  var chips = $('chips');
  STATUSES.forEach(function (name) {
    var b = el('button', name, 'chip'); b.type = 'button';
    b.setAttribute('aria-pressed', String(name === filter));
    b.addEventListener('click', function () {
      filter = name;
      Array.prototype.forEach.call(chips.children, function (c) { c.setAttribute('aria-pressed', String(c.textContent === filter)); });
      render();
    });
    chips.appendChild(b);
  });
  $('q').addEventListener('input', render);

  // ---------- Dialog helpers ----------
  document.querySelectorAll('[data-close]').forEach(function (b) {
    b.addEventListener('click', function () { $(b.dataset.close).close(); });
  });

  // ---------- Add payment ----------
  function openPay(s) {
    payingFee = s;
    $('payTitle').textContent = 'Add payment – ' + s.name + ' (due ' + inr(s.balance) + ')';
    $('amt').value = ''; $('amt').max = s.balance; $('pdate').value = today(); $('pmethod').value = 'Cash';
    setMsg('payErr', ''); $('payDlg').showModal(); $('amt').focus();
  }
  $('payForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var amount = Number($('amt').value);
    if (!(amount > 0)) { setMsg('payErr', 'Enter an amount above 0.', 'err'); return; }
    if (amount > Number(payingFee.balance)) { setMsg('payErr', 'Amount is more than the balance (' + inr(payingFee.balance) + ').', 'err'); return; }
    var btn = $('paySave'); btn.disabled = true;
    var r = await sb.from('payments').insert({ fee_id: payingFee.fee_id, amount: amount, paid_on: $('pdate').value, method: $('pmethod').value });
    btn.disabled = false;
    if (r.error) { setMsg('payErr', friendly(r.error), 'err'); return; }
    $('payDlg').close(); await loadData();
  });

  // ---------- Add student ----------
  $('addStudentBtn').addEventListener('click', function () {
    $('stuForm').reset(); setMsg('stuErr', '');
    var d = new Date(); d.setDate(d.getDate() + 30);
    $('sDue').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    $('stuDlg').showModal(); $('sName').focus();
  });
  $('stuForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = $('stuSave'); btn.disabled = true;
    var r = await sb.rpc('add_student', {
      p_name: $('sName').value, p_course: $('sCourse').value, p_parent: $('sParent').value,
      p_phone: $('sPhone').value.trim(), p_fee: Number($('sFee').value), p_due: $('sDue').value
    });
    btn.disabled = false;
    if (r.error) { setMsg('stuErr', friendly(r.error), 'err'); return; }
    $('stuDlg').close(); await loadData();
  });

  // Sign out automatically if the session ends elsewhere
  sb.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') { show('app', false); show('login', true); }
  });

  start();
})();
