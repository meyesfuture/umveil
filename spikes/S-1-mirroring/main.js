const { app, BrowserWindow, desktopCapturer } = require('electron')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  
  const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] })
  const html = `
    <html>
      <body>
        <h1>Window Sources</h1>
        <ul id="list"></ul>
        <video id="vid" style="max-width: 100%; border: 1px solid red;" autoplay></video>
        <script>
          const { desktopCapturer } = require('electron');
          const sources = ${JSON.stringify(sources)};
          const list = document.getElementById('list');
          sources.forEach(s => {
            const li = document.createElement('li');
            li.textContent = s.name;
            li.onclick = async () => {
              const stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                video: {
                  mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: s.id
                  }
                }
              });
              document.getElementById('vid').srcObject = stream;
            };
            list.appendChild(li);
          });
        </script>
      </body>
    </html>
  `
  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
})
