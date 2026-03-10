const { app } = require('electron')
app.whenReady().then(() => {
  console.log('ARGV=' + JSON.stringify(process.argv))
  console.log('SWITCH=' + JSON.stringify(app.commandLine.getSwitchValue('workspace-root')))
  app.quit()
})
