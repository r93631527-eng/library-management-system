import nodemailer from 'nodemailer'

const emailTemplates = {
  welcome: {
    subject: 'Welcome to LibraAI',
    heading: 'Welcome to LibraAI',
    message: 'Your account is ready. You can now explore your library and use the PDF study tools.',
    documentLabel: '',
  },
  'pdf-upload': {
    subject: 'Your PDF upload was successful',
    heading: 'PDF uploaded successfully',
    message: 'Your PDF was received successfully and is ready in LibraAI.',
    documentLabel: 'Uploaded PDF',
  },
  'summary-complete': {
    subject: 'Your PDF summary is ready',
    heading: 'Your summary is ready',
    message: 'LibraAI has finished summarizing your PDF. Return to the app to review your study notes.',
    documentLabel: 'Summarized PDF',
  },
  'new-library-pdf': {
    subject: 'A new PDF is available in LibraAI',
    heading: 'New PDF in your library',
    message: 'A new PDF has been added to the LibraAI library. Sign in to view it.',
    documentLabel: 'New library PDF',
  },
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

function renderNotificationEmail({ event, filename = '', name = '' }) {
  const template = emailTemplates[event]
  if (!template) throw new Error(`Unknown LibraAI email notification: ${event}`)
  const safeName = escapeHtml(name)
  const safeFilename = escapeHtml(filename)
  const greeting = safeName ? `Hello ${safeName},` : 'Hello,'
  const textGreeting = name ? `Hello ${name},` : 'Hello,'
  const documentBlock = template.documentLabel && safeFilename
    ? `<tr><td style="padding:18px 20px;background:#101914;border:1px solid #26382c;border-radius:10px"><div style="font-size:11px;line-height:16px;color:#a6b5aa;text-transform:uppercase;letter-spacing:1px">${template.documentLabel}</div><div style="padding-top:6px;color:#f2f7f3;font-size:15px;line-height:22px;word-break:break-word">${safeFilename}</div></td></tr><tr><td style="height:20px"></td></tr>`
    : ''
  const text = [
    template.heading,
    '',
    textGreeting,
    template.message,
    ...(template.documentLabel && filename ? ['', `${template.documentLabel}: ${filename}`] : []),
    '',
    'LibraAI | Your library, ready to learn.',
  ].join('\n')
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:24px 12px;background:#0b100d;color:#e8f0ea;font-family:Arial,Helvetica,sans-serif">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${template.message}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;border:1px solid #26382c;border-radius:16px;background:#111914">
    <tr><td style="padding:28px 28px 20px">
      <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#78d99a">LIBRA<span style="color:#f2f7f3">AI</span></div>
      <div style="height:1px;margin-top:20px;background:#26382c"></div>
    </td></tr>
    <tr><td style="padding:8px 28px 30px">
      <h1 style="margin:0 0 18px;color:#f2f7f3;font-size:25px;line-height:32px">${template.heading}</h1>
      <p style="margin:0 0 12px;color:#dce7de;font-size:15px;line-height:24px">${greeting}</p>
      <p style="margin:0 0 22px;color:#b9c8bd;font-size:15px;line-height:24px">${template.message}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${documentBlock}</table>
      <p style="margin:0;color:#7f9184;font-size:12px;line-height:19px">This is an automatic notification from LibraAI. Please do not reply to this email.</p>
    </td></tr>
    <tr><td style="padding:18px 28px;border-top:1px solid #26382c;color:#819187;font-size:12px;line-height:18px">LibraAI · Your library, ready to learn.</td></tr>
  </table>
</body>
</html>`
  return { subject: template.subject, text, html }
}

function createEmailService({ env = process.env, transport, createTransport = nodemailer.createTransport, logger = console } = {}) {
  const emailAddress = String(env.GMAIL_USER ?? '').trim()
  const appPassword = String(env.GMAIL_APP_PASSWORD ?? '').replace(/\s/g, '')
  const mailTransport = transport ?? (emailAddress && appPassword ? createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: emailAddress, pass: appPassword },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  }) : null)
  let configurationWarningLogged = false

  async function send({ to, event, filename = '', name = '' }) {
    if (!to) return false
    if (!mailTransport || !emailAddress || !appPassword) {
      if (!configurationWarningLogged) {
        logger.warn('LibraAI email notifications are disabled; configure GMAIL_USER and GMAIL_APP_PASSWORD.')
        configurationWarningLogged = true
      }
      return false
    }
    const message = renderNotificationEmail({ event, filename, name })
    await mailTransport.sendMail({
      from: { name: 'LibraAI', address: emailAddress },
      to,
      ...message,
    })
    return true
  }

  return { send }
}

export { createEmailService, renderNotificationEmail }
