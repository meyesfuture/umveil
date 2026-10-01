import { _electron as electron } from 'playwright'
import { test, expect } from '@playwright/test'
import * as path from 'path'

test.describe('umveil e2e', () => {
  let app: any

  test.beforeAll(async () => {
    // Launch electron app
    app = await electron.launch({
      args: [path.join(__dirname, '../out/main/index.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    })
  })

  test.afterAll(async () => {
    if (app) await app.close()
  })

  test('Cockpit window loads', async () => {
    const window = await app.firstWindow()
    const title = await window.title()
    // It should load successfully
    expect(title).toBeTruthy()
    
    // Check if #root exists
    const root = window.locator('#root')
    await expect(root).toBeAttached()
  })
})
