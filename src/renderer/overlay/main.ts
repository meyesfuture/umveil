document.getElementById('return-btn')!.addEventListener('click', () => {
  window.umveilOverlay.return().catch(() => undefined)
})
