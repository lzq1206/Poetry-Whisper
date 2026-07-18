(() => {
  const { forms, toneMap, ancientOblique, synonyms } = POETRY_DATA;
  const fullToneMap = {};
  const state = { family: 'shi', formId: 'wujue', variant: 0, text: [], selected: null, overrides: {} };
  const $ = (id) => document.getElementById(id);
  const familySelect = $('familySelect'), formSelect = $('formSelect'), variantSelect = $('variantSelect');

  function form() { return forms[state.family].find((item) => item.id === state.formId); }
  function pattern() { return form().variants[state.variant][1]; }
  function expected(line, slot) { return pattern()[line][slot]; }
  function absoluteSlot(line, slot) { return pattern().slice(0, line).reduce((sum, rule) => sum + rule.length, 0) + slot; }
  function isRhymeSlot(line, slot) { return Boolean(form().rhymePositions?.[state.variant]?.includes(absoluteSlot(line, slot))); }
  function toneOf(char, key) {
    if (!char) return '';
    if (state.overrides[key]) return state.overrides[key];
    const base = fullToneMap[char] || toneMap[char] || '';
    if (ancientOblique.has(char) && base === 'P') return 'Z';
    return base;
  }
  function displayTone(value) { return value || '？'; }
  function isFit(tone, wanted) { return wanted === 'A' || tone.includes(wanted); }
  function joinedLine(index) { return (state.text[index] || []).join(''); }
  function isSelfRescue(lineIndex) {
    const chars = state.text[lineIndex] || [], rule = pattern()[lineIndex];
    if (chars.length !== rule.length || chars.some((x) => !x)) return false;
    const actual = chars.map((ch, i) => toneOf(ch, `${lineIndex}-${i}`));
    if (actual.some((x) => x.length !== 1)) return false;
    // 常见“孤平拗救”：平平仄仄平可作仄平平仄平；七言取其后五字。
    return rule.slice(-5) === 'PPZZP' && actual.slice(-5).join('') === 'ZPPZP';
  }
  function checkLine(lineIndex) {
    const chars = state.text[lineIndex] || [], rule = pattern()[lineIndex];
    const full = chars.length === rule.length && chars.every(Boolean);
    const values = chars.map((ch, i) => toneOf(ch, `${lineIndex}-${i}`));
    const wrong = values.reduce((n, tone, i) => n + (tone && !isFit(tone, rule[i]) ? 1 : 0), 0);
    const unknown = values.filter((tone) => tone && !tone).length;
    const tail = full ? values.slice(-3) : [];
    return { full, wrong, unknown, rescue: isSelfRescue(lineIndex), triplePing: tail.length === 3 && tail.every((x) => x === 'P'), values };
  }
  function charStatus(line, slot) {
    const char = (state.text[line] || [])[slot] || '', tone = toneOf(char, `${line}-${slot}`), wanted = expected(line, slot);
    if (!char) return 'pending';
    if (!tone) return 'unknown';
    if (isFit(tone, wanted)) return 'ok';
    return 'bad';
  }
  function updateStatus() {
    const checks = pattern().map((_, i) => checkLine(i));
    const filled = checks.filter((x) => x.full).length;
    const unknown = checks.reduce((n, x) => n + x.values.filter((v) => !v).length, 0);
    const wrong = checks.reduce((n, x) => n + x.wrong, 0);
    const triple = checks.filter((x) => x.triplePing).length;
    const rescue = checks.filter((x) => x.rescue).length;
    const node = $('meterStatus'); node.className = 'meter-status';
    if (!filled) node.textContent = '等待落笔';
    else if (wrong && !rescue) { node.textContent = `${wrong} 处待斟酌${triple ? ` · ${triple} 处三平尾` : ''}`; node.classList.add('warn'); }
    else if (unknown) { node.textContent = `${unknown} 字待查韵`; node.classList.add('warn'); }
    else { node.textContent = `已填 ${filled}/${pattern().length} 句${rescue ? ' · 含拗救' : ' · 合谱'}`; node.classList.add('good'); }
  }
  function selectSlot(line, slot) { state.selected = { line, slot }; renderSuggestions(); document.querySelectorAll('.char-slot').forEach((n) => n.classList.remove('selected')); document.querySelector(`.char-slot[data-key="${line}-${slot}"]`)?.classList.add('selected'); }
  function variants() {
    variantSelect.innerHTML = form().variants.map(([name], i) => `<option value="${i}">${name}</option>`).join('');
    variantSelect.value = state.variant;
  }
  function renderForms() {
    formSelect.innerHTML = forms[state.family].map((item) => `<option value="${item.id}">${item.name}</option>`).join('');
    formSelect.value = state.formId; variants();
  }
  function focus(line, slot) { requestAnimationFrame(() => document.querySelector(`.char-input[data-key="${line}-${slot}"]`)?.focus()); }
  function inputAt(line, slot, raw) {
    const chars = [...raw].filter((ch) => /[\u3400-\u9fff]/.test(ch));
    if (!chars.length) { state.text[line][slot] = ''; renderEditor(); focus(line, slot); return; }
    let curLine = line, curSlot = slot;
    chars.forEach((char) => {
      state.text[curLine][curSlot] = char;
      if (curSlot + 1 < pattern()[curLine].length) curSlot++;
      else if (curLine + 1 < pattern().length) { curLine++; curSlot = 0; }
    });
    renderEditor(); focus(curLine, curSlot);
  }
  function nextSlot(line, slot, direction) {
    const flat = pattern().flatMap((row, l) => row.split('').map((_, s) => [l, s]));
    const pos = flat.findIndex(([l, s]) => l === line && s === slot);
    return flat[Math.max(0, Math.min(flat.length - 1, pos + direction))];
  }
  function renderEditor() {
    const root = $('poemEditor'); root.innerHTML = '';
    pattern().forEach((line, lineIndex) => {
      if (!state.text[lineIndex]) state.text[lineIndex] = Array(line.length).fill('');
      const row = document.createElement('div'); row.className = 'poem-line';
      row.innerHTML = `<span class="line-label">${String(lineIndex + 1).padStart(2, '0')}</span><div class="line-slots"></div>`;
      const slots = row.querySelector('.line-slots');
      [...line].forEach((wanted, slot) => {
        const key = `${lineIndex}-${slot}`, char = state.text[lineIndex][slot] || '', tone = toneOf(char, key), status = charStatus(lineIndex, slot);
        const el = document.createElement('label'); el.className = `char-slot ${status}${state.selected?.line === lineIndex && state.selected?.slot === slot ? ' selected' : ''}${tone.length > 1 ? ' ambiguous' : ''}`; el.dataset.key = key;
        const rhyme = isRhymeSlot(lineIndex, slot) ? ' ·韵' : '';
        el.innerHTML = `<input class="char-input" data-key="${key}" maxlength="1" autocomplete="off" inputmode="text" aria-label="第${lineIndex + 1}句第${slot + 1}字，要求${wanted === 'A' ? '可平可仄' : wanted === 'P' ? '平声' : '仄声'}" value="${char}" /><span class="tone-hint">${char ? displayTone(tone) : wanted === 'A' ? '△' : wanted}${rhyme}</span>${tone.length > 1 ? '<button type="button" title="切换此字读音">切</button>' : ''}`;
        el.addEventListener('click', (event) => { if (!event.target.matches('button')) selectSlot(lineIndex, slot); });
        const input = el.querySelector('input');
        input.addEventListener('input', (event) => inputAt(lineIndex, slot, event.target.value));
        input.addEventListener('paste', (event) => { event.preventDefault(); inputAt(lineIndex, slot, event.clipboardData.getData('text')); });
        input.addEventListener('keydown', (event) => { if (event.key === 'Backspace' && !input.value) { const [l, s] = nextSlot(lineIndex, slot, -1); state.text[l][s] = ''; renderEditor(); focus(l, s); } if (event.key === 'ArrowLeft') { event.preventDefault(); const [l,s] = nextSlot(lineIndex, slot, -1); focus(l,s); } if (event.key === 'ArrowRight') { event.preventDefault(); const [l,s] = nextSlot(lineIndex, slot, 1); focus(l,s); } });
        el.querySelector('button')?.addEventListener('click', (event) => {
          event.preventDefault();
          const readings = (fullToneMap[char] || toneMap[char] || tone).split('/');
          const now = state.overrides[key] || readings[0];
          state.overrides[key] = readings[(readings.indexOf(now) + 1) % readings.length];
          renderEditor(); focus(lineIndex, slot);
        });
        slots.appendChild(el);
      });
      root.appendChild(row);
    });
    updateStatus(); renderSuggestions();
  }
  function suggestionTerms() {
    const selected = state.selected; if (!selected) return [];
    const current = joinedLine(selected.line); let matches = [];
    Object.keys(synonyms).sort((a,b) => b.length-a.length).forEach((phrase) => { if (current.includes(phrase)) matches.push(...synonyms[phrase]); });
    const char = state.text[selected.line]?.[selected.slot];
    if (char) matches.push(...(synonyms[char] || []));
    if (!matches.length) matches = ['山','水','云','月','风','花','春','秋','清','远'];
    return [...new Set(matches)].filter((x) => [...x].length === 1).slice(0, 18);
  }
  function renderSuggestions() {
    const target = $('suggestions'), label = $('selectedSlot');
    if (!state.selected) { label.textContent = '尚未选定字位'; target.innerHTML = ''; return; }
    const { line, slot } = state.selected, want = expected(line, slot), key = `${line}-${slot}`;
    label.textContent = `第 ${line + 1} 句 · 第 ${slot + 1} 字 · 要求 ${want === 'A' ? '可平可仄' : want === 'P' ? '平声' : '仄声'}`;
    target.innerHTML = '';
    suggestionTerms().forEach((word) => {
      const tone = toneOf(word, key), fit = isFit(tone, want);
      const button = document.createElement('button'); button.type = 'button'; button.className = `suggestion ${fit ? 'fit' : 'no-fit'}`;
      button.innerHTML = `${word}<small>${displayTone(tone)}${fit ? ' · 合谱' : ''}</small>`;
      button.addEventListener('click', () => { state.text[line][slot] = word; renderEditor(); focus(line, slot); }); target.appendChild(button);
    });
  }
  function resetText() { state.text = pattern().map((line) => Array(line.length).fill('')); state.selected = null; state.overrides = {}; renderEditor(); }
  familySelect.addEventListener('change', () => { state.family = familySelect.value; state.formId = forms[state.family][0].id; state.variant = 0; renderForms(); resetText(); });
  formSelect.addEventListener('change', () => { state.formId = formSelect.value; state.variant = 0; variants(); resetText(); });
  variantSelect.addEventListener('change', () => { state.variant = Number(variantSelect.value); resetText(); });
  $('clearBtn').addEventListener('click', resetText);
  function applyCiCatalog(catalog) {
    forms.ci = catalog.map((entry) => ({
      id: entry.id,
      name: entry.name,
      description: `${entry.type}；含 ${entry.variants.length} 个已载入谱式。别名：${entry.aliases.join('、')}。`,
      variants: entry.variants.map((variant) => [variant.label, variant.lines]),
      rhymePositions: entry.variants.map((variant) => variant.rhyme_pos),
    }));
    if (state.family === 'ci') { state.formId = forms.ci[0].id; state.variant = 0; renderForms(); resetText(); }
  }
  async function loadFullData() {
    try {
      const [catalog, tones] = await Promise.all([
        fetch('./data/ci-catalog.json').then((response) => response.ok ? response.json() : Promise.reject(response.status)),
        fetch('./data/pingshui-tone.json').then((response) => response.ok ? response.json() : Promise.reject(response.status)),
      ]);
      Object.assign(fullToneMap, tones); applyCiCatalog(catalog); renderEditor();
    } catch (error) { console.warn('Full ci / tone data unavailable; using built-in starter data.', error); }
  }
  function init() { renderForms(); $('formTitle').textContent = form().name; $('formDescription').textContent = form().description; const originalRender = renderEditor; renderEditor = function(){ $('formTitle').textContent = form().name; $('formDescription').textContent = form().description; originalRender(); }; resetText(); loadFullData(); }
  init();
})();
