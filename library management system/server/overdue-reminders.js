const defaultIntervalMs = 15 * 60 * 1000

function createOverdueReminderScheduler({ database, emailService, logger = console, now = () => new Date() }) {
  let interval
  let running = false

  async function checkNow() {
    if (running) return
    running = true
    try {
      const today = now().toISOString().slice(0, 10)
      const overdueLoans = database.prepare(`SELECT br.id AS loanId, br.due_date AS dueDate,
        b.title AS bookTitle, u.id AS userId, u.name AS studentName, u.email AS studentEmail
        FROM borrow_records br
        JOIN books b ON b.id = br.book_id
        JOIN users u ON u.id = br.student_id
        WHERE br.status = 'issued' AND br.due_date < ? AND u.email <> ''
        ORDER BY br.due_date, br.id`).all(today)
      let sentReminders = 0

      for (const loan of overdueLoans) {
        const key = `email_overdue_loan:${loan.loanId}`
        database.exec('BEGIN IMMEDIATE')
        let claimed = false
        try {
          const stillOverdue = database.prepare("SELECT id FROM borrow_records WHERE id = ? AND status = 'issued' AND due_date < ?").get(loan.loanId, today)
          if (stillOverdue) {
            claimed = database.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, 'pending').changes === 1
          }
          database.exec('COMMIT')
        } catch (error) {
          database.exec('ROLLBACK')
          throw error
        }
        if (!claimed) continue

        try {
          const sent = await emailService.send({
            to: loan.studentEmail,
            name: loan.studentName,
            event: 'overdue-loan',
            filename: loan.bookTitle,
            dueDate: loan.dueDate,
          })
          if (sent) {
            database.prepare('UPDATE settings SET value = ? WHERE key = ?').run('sent', key)
            sentReminders += 1
          } else {
            database.prepare('DELETE FROM settings WHERE key = ? AND value = ?').run(key, 'pending')
          }
        } catch (error) {
          logger.error('LibraAI overdue loan email failed.', {
            loanId: loan.loanId,
            error: error.message ?? String(error),
          })
          database.prepare('DELETE FROM settings WHERE key = ? AND value = ?').run(key, 'pending')
        }
      }
      logger.info?.('LibraAI overdue reminder check completed.', {
        overdueLoans: overdueLoans.length,
        sentReminders,
        date: today,
      })
    } catch (error) {
      logger.error('LibraAI overdue reminder check failed.', { error: error.message ?? String(error) })
    } finally {
      running = false
    }
  }

  function start(intervalMs = defaultIntervalMs) {
    if (interval) return stop
    logger.info?.(`LibraAI overdue reminder scheduler started; checking every ${Math.round(intervalMs / 60000)} minute(s) using UTC dates.`)
    void checkNow()
    interval = setInterval(() => { void checkNow() }, intervalMs)
    interval.unref()
    return stop
  }

  function stop() {
    if (!interval) return
    clearInterval(interval)
    interval = undefined
  }

  return { checkNow, start, stop }
}

function startOverdueReminderScheduler(options) {
  const scheduler = createOverdueReminderScheduler(options)
  scheduler.start()
  return scheduler
}

export { createOverdueReminderScheduler, startOverdueReminderScheduler }
