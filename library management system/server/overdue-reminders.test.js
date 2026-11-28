import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createDatabase } from './index.js'
import { createOverdueReminderScheduler } from './overdue-reminders.js'

function seedLoan(database, { id, dueDate, status = 'issued', email = `${id}@example.edu`, userId = `user-${id}` }) {
  database.prepare(`INSERT INTO users (id, name, usn, email, department, role, password_hash)
    VALUES (?, ?, ?, ?, ?, 'student', 'test-hash')`).run(userId, `Student ${id}`, `USN-${id}`, email, 'Engineering')
  const bookId = `book-${id}`
  database.prepare('INSERT INTO books (id, title, author, isbn, totalCopies) VALUES (?, ?, ?, ?, 1)')
    .run(bookId, `Book ${id}`, 'Library', `ISBN-${id}`)
  database.prepare(`INSERT INTO borrow_records (id, student_id, book_id, issue_date, due_date, student_email, status, fine)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)`).run(id, userId, bookId, '2025-01-01', dueDate, 'stale-record-email@example.edu', status)
}

test('scheduler emails logged-out students once for issued loans past their UTC due date', async () => {
  const database = createDatabase(':memory:')
  const sent = []
  let timeReads = 0
  const errors = []
  seedLoan(database, { id: 'past-loan', dueDate: '2025-02-01' })
  seedLoan(database, { id: 'due-today', dueDate: '2025-02-02' })
  seedLoan(database, { id: 'future-loan', dueDate: '2025-02-03' })
  seedLoan(database, { id: 'returned-loan', dueDate: '2025-02-01', status: 'returned' })
  seedLoan(database, { id: 'no-email-loan', dueDate: '2025-02-01', email: '' })
  database.prepare('UPDATE users SET email = ? WHERE id = ?').run('current-account@example.edu', 'user-past-loan')

  const scheduler = createOverdueReminderScheduler({
    database,
    now: () => {
      timeReads += 1
      return new Date('2025-02-02T00:30:00.000Z')
    },
    logger: { error: (...details) => errors.push(details) },
    emailService: {
      send: async (notification) => {
        sent.push(notification)
        return true
      },
    },
  })

  scheduler.start(15)
  await new Promise((resolve) => setTimeout(resolve, 70))
  scheduler.stop()
  await scheduler.checkNow()

  assert.ok(timeReads >= 2, 'the recurring timer runs checks after startup')
  assert.deepEqual(sent.map((notification) => notification.to), ['current-account@example.edu'])
  assert.deepEqual(sent[0], {
    to: 'current-account@example.edu',
    name: 'Student past-loan',
    event: 'overdue-loan',
    filename: 'Book past-loan',
    dueDate: '2025-02-01',
  })
  assert.equal(database.prepare("SELECT value FROM settings WHERE key = 'email_overdue_loan:past-loan'").get().value, 'sent')
  assert.equal(database.prepare("SELECT value FROM settings WHERE key = 'email_overdue_loan:due-today'").get(), undefined)
  assert.equal(database.prepare("SELECT value FROM settings WHERE key = 'email_overdue_loan:future-loan'").get(), undefined)
  assert.equal(errors.length, 0)

  const nextUtcDayScheduler = createOverdueReminderScheduler({
    database,
    now: () => new Date('2025-02-03T00:00:00.000Z'),
    logger: { error: (...details) => errors.push(details) },
    emailService: {
      send: async (notification) => {
        sent.push(notification)
        return true
      },
    },
  })
  await nextUtcDayScheduler.checkNow()
  await nextUtcDayScheduler.checkNow()

  assert.deepEqual(sent.map((notification) => notification.to), ['current-account@example.edu', 'due-today@example.edu'])
  assert.equal(database.prepare("SELECT value FROM settings WHERE key = 'email_overdue_loan:due-today'").get().value, 'sent')
  assert.equal(errors.length, 0)
  database.close()
})

test('retries failed reminder delivery on the next background check without duplicates after success', async () => {
  const database = createDatabase(':memory:')
  seedLoan(database, { id: 'retry-loan', dueDate: '2025-01-31' })
  let attempts = 0
  const errors = []
  const scheduler = createOverdueReminderScheduler({
    database,
    now: () => new Date('2025-02-02T00:00:00.000Z'),
    logger: { error: (...details) => errors.push(details) },
    emailService: {
      send: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('Temporary SMTP issue.')
        return true
      },
    },
  })

  await scheduler.checkNow()
  assert.equal(database.prepare("SELECT value FROM settings WHERE key = 'email_overdue_loan:retry-loan'").get(), undefined)
  await scheduler.checkNow()
  await scheduler.checkNow()

  assert.equal(attempts, 2)
  assert.equal(database.prepare("SELECT value FROM settings WHERE key = 'email_overdue_loan:retry-loan'").get().value, 'sent')
  assert.equal(errors.length, 1)
  database.close()
})
