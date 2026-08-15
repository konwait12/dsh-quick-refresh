// Browser half of dsh-quick-refresh.
// Adds a "刷新 / 热应用" tab under Settings → Plugins. One click tells the host
// to apply the current profile patch to the running Loader, hot-mounts simple
// new plugins, then reloads the page so client bundles activate.

window.__ModuleLoader__.load({ id: 'dsh-quick-refresh', factory: (require) => {
  var module = { exports: {} }; var exports = module.exports;

  const React = require('react')
  const { useState } = React
  const h = React.createElement

  function api(method, params) {
    return fetch('/api/dsh-quick-refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ method }, params || {})),
    }).then((r) => r.json())
  }

  const CSS = `
.qrf{font-size:14px;line-height:1.6;color:var(--dsw-alias-label-primary);max-width:48rem}
.qrf-card{background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px 16px;margin-top:10px}
.qrf-title{font-size:15px;font-weight:600;margin:0 0 6px}
.qrf-desc{font-size:12.5px;color:var(--dsw-alias-label-secondary);margin:0 0 12px}
.qrf-btn{appearance:none;background:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3);font:inherit;font-size:13px;font-weight:600;padding:6px 16px;border-radius:8px;cursor:pointer}
.qrf-btn:hover:not(:disabled){opacity:.85}
.qrf-btn:disabled{opacity:.4;cursor:default}
.qrf-ok{color:var(--dsw-alias-state-success-primary);font-size:12.5px;margin-top:8px;white-space:pre-wrap}
.qrf-err{color:var(--dsw-alias-label-error);font-size:12.5px;margin-top:8px;white-space:pre-wrap}
.qrf-meta{font-family:ui-monospace,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:8px;white-space:pre-wrap}
.qrf-spin{display:inline-block;width:12px;height:12px;border:2px solid var(--dsw-alias-border-l2);border-top-color:var(--dsw-static-deepseek-500);border-radius:50%;animation:qrf-spin .7s linear infinite;vertical-align:-2px;margin-right:7px}
@keyframes qrf-spin{to{transform:rotate(360deg)}}
`

  function RefreshPanel() {
    const [state, setState] = useState({ phase: 'idle' })

    const run = () => {
      setState({ phase: 'running' })
      api('refresh').then((r) => {
        if (r && r.ok) {
          const lines = [
            '已应用 ' + (r.disabled || []).length + ' 条启用/禁用变更',
            '热挂载 ' + (r.hotMounted || []).length + ' 个新插件',
          ]
          if ((r.hotSkipped || []).length) lines.push('无法热挂载（需重启）：' + r.hotSkipped.join(', '))
          if (r.error) lines.push('警告：' + r.error)
          setState({ phase: 'done', ok: true, message: lines.join('\n') })
          setTimeout(() => { try { location.reload() } catch (e) {} }, 800)
        } else {
          setState({ phase: 'done', ok: false, message: String((r && (r.error || r.output)) || '刷新失败') })
        }
      }).catch((e) => {
        setState({ phase: 'done', ok: false, message: String((e && e.message) || e) })
      })
    }

    return h('div', { className: 'qrf' },
      h('div', { className: 'qrf-card' },
        h('h3', { className: 'qrf-title' }, '主动刷新 / 热应用'),
        h('p', { className: 'qrf-desc' },
          '把当前 profiles/web/cordis.patch.yml 的启用/禁用状态应用到正在运行的 Loader，' +
          '并尝试热挂载新增的简单插件；随后自动刷新页面生效，无需重启 dsh web。'
        ),
        h('button', {
          className: 'qrf-btn',
          disabled: state.phase === 'running',
          onClick: run,
        }, state.phase === 'running' ? '正在应用…' : '刷新并应用'),
        state.phase === 'running' ? h('div', { className: 'qrf-ok' },
          h('span', { className: 'qrf-spin' }), '正在应用，请稍候…') : null,
        state.phase === 'done' ? h('div', { className: state.ok ? 'qrf-ok' : 'qrf-err' }, state.message) : null,
        state.phase === 'done' && state.ok ? h('div', { className: 'qrf-meta' }, '即将自动刷新页面…') : null,
      ),
    )
  }

  const inject = ['slots']

  function apply(ctx) {
    const slots = ctx.get('slots')
    if (slots === undefined) return
    ctx.effect(() => {
      const id = 'dsh-quick-refresh-style'
      if (!document.getElementById(id)) {
        const s = document.createElement('style')
        s.id = id
        s.textContent = CSS
        document.head.appendChild(s)
      }
      return () => { const el = document.getElementById(id); if (el) el.remove() }
    }, 'quick-refresh-style')
    // 界面左下角悬浮刷新按钮：主动刷新/热应用，无需进设置页。
    const btn = document.createElement('button')
    btn.id = 'dsh-quick-refresh-fab'
    btn.textContent = '⟳'
    btn.title = '刷新并应用插件（免重启）'
    Object.assign(btn.style, {
      position: 'fixed',
      left: '12px',
      bottom: '12px',
      zIndex: '2147483000',
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
      background: 'var(--dsw-alias-bg-layer-3, #1e1e1e)',
      color: 'var(--dsw-alias-label-primary, #eee)',
      fontSize: '18px',
      cursor: 'pointer',
      boxShadow: '0 2px 10px rgba(0,0,0,.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity: '.9',
    })
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1' })
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '.9' })
    const toast = document.createElement('div')
    toast.id = 'dsh-quick-refresh-toast'
    Object.assign(toast.style, {
      position: 'fixed',
      left: '56px',
      bottom: '14px',
      zIndex: '2147483001',
      background: 'var(--dsw-alias-bg-layer-2, #111)',
      color: 'var(--dsw-alias-label-primary, #eee)',
      border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,.4))',
      borderRadius: '8px',
      padding: '6px 10px',
      fontSize: '12px',
      maxWidth: '280px',
      display: 'none',
      whiteSpace: 'pre-wrap',
      boxShadow: '0 4px 16px rgba(0,0,0,.35)',
    })
    document.body.appendChild(btn)
    document.body.appendChild(toast)
// 放在会话页右上角“session log (轨迹)”标签左侧：克隆该 tab 外观作为图标按钮。
    btn.style.display = 'none'
    toast.style.display = 'none'
    const findTrajectoryTab = () => {
      const targets = ['轨迹', 'Trajectory', 'Session log', 'Session Log', 'session log']
      const all = document.querySelectorAll('button, a, [role="tab"], [role="button"]')
      for (const el of all) {
        const txt = (el.textContent || '').trim()
        if (targets.includes(txt)) return el
      }
      return null
    }
    let refreshTabBtn = null
    const insertRefreshTab = () => {
      const tab = findTrajectoryTab()
      if (!tab) return
      if (!refreshTabBtn) {
        refreshTabBtn = tab.cloneNode(true)
        refreshTabBtn.removeAttribute('aria-selected')
        refreshTabBtn.removeAttribute('aria-controls')
        try { refreshTabBtn.classList.forEach(c => { if (c.toLowerCase().includes('active')) refreshTabBtn.classList.remove(c) }) } catch {}
        refreshTabBtn.setAttribute('aria-label', '刷新并应用插件（免重启）')
        refreshTabBtn.title = '刷新并应用插件（免重启）'
        refreshTabBtn.textContent = '⟳'
// 按字符长度紧凑显示：去掉 tab 的 padding/min-width，只保留图标本身宽度
          Object.assign(refreshTabBtn.style, {
            padding: '0 8px',
            minWidth: 'auto',
            width: 'auto',
            fontSize: '13px',
            lineHeight: '1',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          })
        refreshTabBtn.addEventListener('click', (ev) => {
          ev.preventDefault()
          ev.stopPropagation()
          run()
        })
      }
      if (refreshTabBtn.parentNode !== tab.parentNode || refreshTabBtn.nextSibling !== tab) {
        if (refreshTabBtn.parentNode) refreshTabBtn.parentNode.removeChild(refreshTabBtn)
        tab.parentNode.insertBefore(refreshTabBtn, tab)
      }
    }
    insertRefreshTab()
    const mo = new MutationObserver(() => insertRefreshTab())
    mo.observe(document.body, { childList: true, subtree: true })
    // 放在“电话”按钮右边：动态找电话/客服/联系类按钮，找不到则回退到左下角。
    const placeButton = () => {
      const candidates = [
        'button[aria-label*="电话" i]',
        'button[title*="电话" i]',
        '[aria-label*="电话" i]',
        '[title*="电话" i]',
        'button[class*="phone" i]',
        '[class*="phone" i]',
        '[data-testid*="phone" i]',
        '[aria-label*="客服" i]',
        '[title*="客服" i]',
        '[aria-label*="联系" i]',
        '[title*="联系" i]',
      ]
      let phone = null
      for (const sel of candidates) {
        const el = document.querySelector(sel)
        if (el && el.getBoundingClientRect().width > 0) { phone = el; break }
      }
      if (phone) {
        const r = phone.getBoundingClientRect()
        btn.style.left = (r.right + 8) + 'px'
        btn.style.bottom = (window.innerHeight - r.bottom) + 'px'
        toast.style.left = (r.right + 40) + 'px'
        toast.style.bottom = (window.innerHeight - r.bottom + 2) + 'px'
      } else {
        btn.style.left = '56px'
        btn.style.bottom = '12px'
        toast.style.left = '96px'
        toast.style.bottom = '14px'
      }
    }
    placeButton()
    window.addEventListener('resize', placeButton)
    setTimeout(placeButton, 600)
    let running = false
    const run = async () => {
      if (running) return
      running = true
      btn.disabled = true
      btn.textContent = '…'
      toast.style.display = 'block'
      toast.textContent = '正在应用…'
      try {
        const r = await fetch('/api/dsh-quick-refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method: 'refresh' }),
        }).then((res) => res.json())
        if (r && r.ok) {
          const lines = [
            '已应用 ' + (r.disabled || []).length + ' 条变更',
            '热挂载 ' + (r.hotMounted || []).length + ' 个插件',
          ]
          if ((r.hotSkipped || []).length) lines.push('需重启：' + r.hotSkipped.join(', '))
          if (r.error) lines.push('警告：' + r.error)
          toast.textContent = lines.join('\n')
          setTimeout(() => { try { location.reload() } catch (e) {} }, 800)
        } else {
          toast.textContent = String((r && (r.error || r.output)) || '刷新失败')
          running = false
          btn.disabled = false
          btn.textContent = '⟳'
        }
      } catch (e) {
        toast.textContent = String((e && e.message) || e)
        running = false
        btn.disabled = false
        btn.textContent = '⟳'
      }
    }
    btn.addEventListener('click', run)
    ctx.effect(() => () => {
        window.removeEventListener('resize', placeButton)
      btn.remove()
if (refreshTabBtn && refreshTabBtn.parentNode) refreshTabBtn.parentNode.removeChild(refreshTabBtn)
        if (mo) mo.disconnect()
      toast.remove()
    }, 'quick-refresh-fab')
    slots.inject('settings.plugins.tab', () => slots.register(
      { name: 'settings.plugins.tab', id: 'quick-refresh', order: 1, label: () => '刷新' },
      RefreshPanel,
    ))
  }

  module.exports = { inject, apply }
  return module.exports;
} })
