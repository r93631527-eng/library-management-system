import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEmailService, renderNotificationEmail } from './email.js'

test('builds branded, escaped, mobile-friendly PDF notification emails', () => {
  const message = renderNotificationEmail({
    event: 'summary-complete',
    name: 'A & B',
    filename: '<notes>.pdf',
  })

  assert.equal(message.subject, 'Your PDF summary is ready')
  assert.match(message.text, /Hello A & B/)
  assert.match(message.text, /<notes>\.pdf/)
  assert.match(message.html, /<meta name="viewport"/)
  assert.match(message.html, /A &amp; B/)
  assert.match(message.html, /&lt;notes&gt;\.pdf/)
  assert.match(message.html, /LIBRA<span style="color:#f2f7f3">AI<\/span>/)
})

test('sends through authenticated Gmail SMTP using a Gmail app password', async () => {
  let transportOptions
  let sentMessage
  const emailService = createEmailService({
    env: { GMAIL_USER: ' libraai@example.com ', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' },
    createTransport: (options) => {
      transportOptions = options
      return {
        sendMail: async (message) => { sentMessage = message },
      }
    },
  })

  assert.equal(await emailService.send({
    to: 'student@example.edu',
    name: 'Student',
    event: 'pdf-upload',
    filename: 'lecture-notes.pdf',
  }), true)
  assert.equal(transportOptions.host, 'smtp.gmail.com')
  assert.equal(transportOptions.port, 465)
  assert.equal(transportOptions.secure, true)
  assert.deepEqual(transportOptions.auth, { user: 'libraai@example.com', pass: 'abcdefghijklmnop' })
  assert.equal(sentMessage.from.address, 'libraai@example.com')
  assert.equal(sentMessage.to, 'student@example.edu')
  assert.equal(sentMessage.subject, 'Your PDF upload was successful')
  assert.match(sentMessage.html, /lecture-notes\.pdf/)
})

test('does not attempt delivery when Gmail credentials are not configured', async () => {
  const warnings = []
  const emailService = createEmailService({
    env: {},
    logger: { warn: (message) => warnings.push(message) },
  })

  assert.equal(await emailService.send({ to: 'student@example.edu', event: 'welcome' }), false)
  assert.equal(await emailService.send({ to: 'student@example.edu', event: 'welcome' }), false)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /GMAIL_USER and GMAIL_APP_PASSWORD/)
})
