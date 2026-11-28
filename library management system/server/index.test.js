import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { after, before, test } from 'node:test'
import { createDatabase, createLibraryServer } from './index.js'

function createTextPdf(text) {
  const safeText = String(text).replace(/[\\()]/g, (character) => `\\${character}`).replace(/[^\x20-\x7E]/g, ' ')
  const stream = `BT /F1 14 Tf 72 720 Td (${safeText}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.7\n'
  const offsets = [0]
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index < offsets.length; index += 1) pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return pdf
}

const database = createDatabase(':memory:')
const uploadPath = mkdtempSync(join(tmpdir(), 'libraai-api-test-'))
const { server } = createLibraryServer({ database, uploadPath })
let origin

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  await new Promise((resolve) => server.close(resolve))
  database.close()
  rmSync(uploadPath, { recursive: true, force: true })
})

async function request(path, { cookie, ...options } = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...options.headers }
  const response = await fetch(`${origin}${path}`, { ...options, headers })
  const body = await response.json()
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

test('serves the emitted PDF.js module worker with a JavaScript MIME type', async () => {
  const assetDirectory = new URL('../dist/assets/', import.meta.url)
  const workerName = readdirSync(assetDirectory).find((name) => /^pdf\.worker\.min-.+\.mjs$/.test(name))
  assert.ok(workerName, 'production PDF.js worker must be emitted into dist/assets')
  const viewerBundle = readdirSync(assetDirectory)
    .filter((name) => /^StudentPages-.+\.js$/.test(name))
    .map((name) => readFileSync(new URL(name, assetDirectory), 'utf8'))
    .find((contents) => contents.includes(workerName))
  assert.ok(viewerBundle, 'production PDF viewer must reference its emitted PDF.js worker')
  const response = await fetch(`${origin}/assets/${workerName}`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^text\/javascript(?:;|$)/)
  assert.ok((await response.arrayBuffer()).byteLength > 100000)
})

test('keeps existing app clients on their matching service-worker asset versions', () => {
  const serviceWorker = readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8')
  assert.doesNotMatch(serviceWorker, /self\.skipWaiting\(\),/)
  assert.doesNotMatch(serviceWorker, /\.clientsClaim\(\)/)
})

test('secures roles and keeps circulation counts in sync', async () => {
  const setup = await request('/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({ name: 'Library Admin', usn: 'LIB001', email: 'librarian@example.edu', password: 'secure-password' }),
  })
  assert.equal(setup.response.status, 200)
  const adminCookie = setup.cookie
  assert.ok(adminCookie)
  assert.equal('password_hash' in setup.body.user, false)
  database.prepare('UPDATE librarians SET librarian_id = ? WHERE user_id = ?').run('LIB-DESK-001', setup.body.user.id)
  const librarianLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'lib-desk-001', password: 'secure-password', role: 'librarian' }),
  })
  assert.equal(librarianLogin.response.status, 200)
  assert.equal(librarianLogin.body.user.id, setup.body.user.id)
  assert.match(librarianLogin.response.headers.get('set-cookie'), /Max-Age=31536000/)
  const librarianSession = await request('/api/auth/session', { cookie: librarianLogin.cookie })
  assert.equal(librarianSession.body.user.id, setup.body.user.id)
  assert.match(librarianSession.response.headers.get('set-cookie'), /Max-Age=31536000/)
  const renewedExpiry = database.prepare('SELECT expires_at FROM sessions JOIN users ON users.id = sessions.user_id WHERE users.id = ?').get(setup.body.user.id).expires_at
  assert.ok(renewedExpiry > Date.now())
  database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run('secure-password', setup.body.user.id)
  const legacyLibrarianLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'lib-desk-001', password: 'secure-password', role: 'librarian' }),
  })
  assert.equal(legacyLibrarianLogin.response.status, 200)
  const migratedHash = database.prepare('SELECT password_hash FROM users WHERE id = ?').get(setup.body.user.id).password_hash
  assert.match(migratedHash, /^[0-9a-f]+:[0-9a-f]+$/)
  const incorrectLibrarianPassword = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'lib-desk-001', password: 'incorrect-password', role: 'admin' }),
  })
  assert.equal(incorrectLibrarianPassword.response.status, 401)
  assert.match(incorrectLibrarianPassword.body.error, /credentials do not match/i)
  const incorrectLibrarianRole = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'lib-desk-001', password: 'secure-password', role: 'student' }),
  })
  assert.equal(incorrectLibrarianRole.response.status, 401)

  const registration = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Test Student', usn: 'STU001', email: 'student@example.edu', department: 'Computer Science', password: 'student-password' }),
  })
  assert.equal(registration.response.status, 200)
  const studentId = registration.body.user.id
  assert.equal(registration.body.user.role, 'student')
  const incorrectStudentPassword = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'STU001', password: 'incorrect-password', role: 'student' }),
  })
  assert.equal(incorrectStudentPassword.response.status, 401)
  assert.match(incorrectStudentPassword.body.error, /credentials do not match/i)

  const updatedStudent = await request(`/api/admin/students/${studentId}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ name: 'Updated Student', usn: 'STU001', email: 'student@example.edu', department: 'Mathematics', semester: '5', mobile: '5550102' }),
  })
  assert.equal(updatedStudent.response.status, 200)
  const deniedResourcePermission = await request(`/api/admin/students/${studentId}`, {
    method: 'PATCH',
    cookie: registration.cookie,
    body: JSON.stringify({ resourceEditor: true }),
  })
  assert.equal(deniedResourcePermission.response.status, 403)
  const resourcePermission = await request(`/api/admin/students/${studentId}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ resourceEditor: true }),
  })
  assert.equal(resourcePermission.response.status, 200)
  assert.equal(resourcePermission.body.canManageResources, true)
  const editorSession = await request('/api/auth/session', { cookie: registration.cookie })
  assert.equal(editorSession.body.user.canManageResources, true)

  const additionalLibrarian = await request('/api/admin/librarians', {
    method: 'POST',
    cookie: adminCookie,
    body: JSON.stringify({ name: 'Second Librarian', usn: 'LIB002', email: 'second-librarian@example.edu', password: 'secure-password' }),
  })
  assert.equal(additionalLibrarian.response.status, 201)
  const disabledLibrarian = await request(`/api/admin/librarians/${additionalLibrarian.body.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ active: false }),
  })
  assert.equal(disabledLibrarian.response.status, 200)
  const selfDisable = await request(`/api/admin/librarians/${setup.body.user.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ active: false }),
  })
  assert.equal(selfDisable.response.status, 400)

  const unsafeRestrictedPdf = await request('/api/resources', {
    method: 'POST',
    cookie: adminCookie,
    body: JSON.stringify({ type: 'pdf', title: 'Private handout', subject: 'Circuits', category: 'Notes', accessType: 'restricted', filePath: '/papers/private.pdf' }),
  })
  assert.equal(unsafeRestrictedPdf.response.status, 400)

  const announcement = await request('/api/admin/announcements', {
    method: 'POST',
    cookie: adminCookie,
    body: JSON.stringify({ message: 'Library hours begin at 8 AM this week.' }),
  })
  assert.equal(announcement.response.status, 201)
  assert.equal(announcement.body.recipients, 1)
  const studentDatabase = await request('/api/database', { cookie: registration.cookie })
  assert.match(studentDatabase.body.notifications[0].message, /Library hours begin at 8 AM/)

  const book = await request('/api/books', {
    method: 'POST',
    cookie: adminCookie,
    body: JSON.stringify({ title: 'Test Book', author: 'Test Author', isbn: '9780000000001', category: 'Testing', totalCopies: 1 }),
  })
  assert.equal(book.response.status, 200)

  const denied = await request('/api/books', {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ title: 'Forbidden', author: 'Test Author', isbn: '9780000000002', totalCopies: 1 }),
  })
  assert.equal(denied.response.status, 403)

  const issue = await request('/api/issues', {
    method: 'POST',
    cookie: adminCookie,
    body: JSON.stringify({ studentId, bookId: book.body.id }),
  })
  assert.equal(issue.response.status, 201)

  const afterIssue = await request('/api/database', { cookie: adminCookie })
  assert.equal(afterIssue.body.books.find((item) => item.id === book.body.id).availableCopies, 0)
  assert.equal(afterIssue.body.issues.length, 1)

  const returned = await request(`/api/issues/${issue.body.id}/return`, { method: 'POST', cookie: adminCookie })
  assert.equal(returned.response.status, 200)
  const afterReturn = await request('/api/database', { cookie: adminCookie })
  assert.equal(afterReturn.body.books.find((item) => item.id === book.body.id).availableCopies, 1)
  assert.equal(afterReturn.body.issues[0].status, 'returned')
  assert.ok(afterReturn.body.issues[0].returnDate)
  assert.ok((await request('/api/database', { cookie: registration.cookie })).body.notifications.some((item) => item.message.includes('Return recorded for Test Book')))

  const requested = await request('/api/requests', {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ bookId: book.body.id }),
  })
  assert.equal(requested.response.status, 201)
  const pendingDatabase = await request('/api/database', { cookie: adminCookie })
  assert.equal(pendingDatabase.body.books.find((item) => item.id === book.body.id).availableCopies, 0)
  assert.equal(pendingDatabase.body.pendingRequestCount, 1)
  const librarianRequestNotification = pendingDatabase.body.notifications.find((item) => item.type === 'book_request' && item.relatedId === requested.body.id)
  assert.ok(librarianRequestNotification)
  assert.match(librarianRequestNotification.message, /Updated Student \(STU001\) requested Test Book on \d{4}-\d{2}-\d{2}\. Status: pending\./)
  const studentPendingDatabase = await request('/api/database', { cookie: registration.cookie })
  assert.equal(studentPendingDatabase.body.issues.find((item) => item.id === requested.body.id).status, 'requested')
  assert.ok(studentPendingDatabase.body.issues.find((item) => item.id === requested.body.id).requestDate)
  const approved = await request(`/api/requests/${requested.body.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ action: 'approve' }),
  })
  assert.equal(approved.response.status, 200)
  assert.equal(approved.body.status, 'issued')
  const approvedStudentDatabase = await request('/api/database', { cookie: registration.cookie })
  assert.ok(approvedStudentDatabase.body.notifications.some((item) => item.type === 'book_request_update' && item.relatedId === requested.body.id && item.message.includes('request for Test Book was approved')))
  const approvedStudentRequest = approvedStudentDatabase.body.issues.find((item) => item.id === requested.body.id)
  assert.equal(approvedStudentRequest.status, 'issued')
  assert.ok(approvedStudentRequest.requestDate)
  const requestFlowLogout = await request('/api/auth/logout', { method: 'POST', cookie: registration.cookie })
  assert.equal(requestFlowLogout.response.status, 200)
  const requestFlowLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'STU001', password: 'student-password', role: 'student' }),
  })
  assert.equal(requestFlowLogin.response.status, 200)
  registration.cookie = requestFlowLogin.cookie
  assert.ok((await request('/api/database', { cookie: registration.cookie })).body.notifications.some((item) => item.type === 'book_request_update' && item.relatedId === requested.body.id))
  const approvedLibrarianDatabase = await request('/api/database', { cookie: adminCookie })
  assert.equal(approvedLibrarianDatabase.body.pendingRequestCount, 0)
  assert.match(approvedLibrarianDatabase.body.notifications.find((item) => item.id === librarianRequestNotification.id).message, /Status: approved\./)

  const dueSoonDate = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  database.prepare('UPDATE borrow_records SET due_date = ? WHERE id = ?').run(dueSoonDate, requested.body.id)
  const dueSoonStudentDatabase = await request('/api/database', { cookie: registration.cookie })
  assert.ok(dueSoonStudentDatabase.body.notifications.some((item) => item.type === 'due_soon' && item.relatedId === requested.body.id && item.message.includes('is due in 2 days')))
  const dueSoonLibrarianDatabase = await request('/api/database', { cookie: adminCookie })
  assert.ok(dueSoonLibrarianDatabase.body.notifications.some((item) => item.type === 'due_soon' && item.relatedId === requested.body.id && item.message.includes('Due soon: Updated Student')))
  const dueSoonStudentAgain = await request('/api/database', { cookie: registration.cookie })
  assert.equal(dueSoonStudentAgain.body.notifications.filter((item) => item.type === 'due_soon' && item.relatedId === requested.body.id).length, 1)

  const overdueDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  database.prepare('UPDATE borrow_records SET due_date = ? WHERE id = ?').run(overdueDate, requested.body.id)
  const overdueStudentDatabase = await request('/api/database', { cookie: registration.cookie })
  assert.ok(overdueStudentDatabase.body.notifications.some((item) => item.type === 'overdue' && item.relatedId === requested.body.id && item.message.includes('Overdue: return Test Book')))
  const overdueLibrarianDatabase = await request('/api/database', { cookie: adminCookie })
  assert.ok(overdueLibrarianDatabase.body.notifications.some((item) => item.type === 'overdue' && item.relatedId === requested.body.id && item.message.includes('Overdue: Updated Student has not returned Test Book')))

  const approvedReturn = await request(`/api/issues/${requested.body.id}/return`, { method: 'POST', cookie: adminCookie })
  assert.equal(approvedReturn.response.status, 200)
  assert.ok(approvedReturn.body.fine > 0)
  const afterApprovedReturn = await request('/api/database', { cookie: adminCookie })
  assert.equal(afterApprovedReturn.body.books.find((item) => item.id === book.body.id).availableCopies, 1)
  assert.equal(afterApprovedReturn.body.issues.find((item) => item.id === requested.body.id).returnDate, approvedReturn.body.returnDate)
  assert.ok(afterApprovedReturn.body.notifications.some((item) => item.message.includes('was returned by Updated Student')))

  const rejectedRequest = await request('/api/requests', {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ bookId: book.body.id }),
  })
  const rejected = await request(`/api/requests/${rejectedRequest.body.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ action: 'reject' }),
  })
  assert.equal(rejected.response.status, 200)
  assert.equal(rejected.body.status, 'rejected')
  const completeHistory = await request('/api/database', { cookie: registration.cookie })
  assert.ok(completeHistory.body.issues.some((item) => item.id === rejectedRequest.body.id && item.status === 'rejected'))
  assert.ok(completeHistory.body.notifications.some((item) => item.type === 'book_request_update' && item.relatedId === rejectedRequest.body.id && item.message.includes('request for Test Book was declined')))
  const rejectedLibrarianDatabase = await request('/api/database', { cookie: adminCookie })
  assert.match(rejectedLibrarianDatabase.body.notifications.find((item) => item.type === 'book_request' && item.relatedId === rejectedRequest.body.id).message, /Status: rejected\./)

  const form = new FormData()
  const pdfContents = '%PDF-1.7\nminimal test document'
  form.append('file', new Blob([pdfContents], { type: 'application/pdf' }), 'notes.pdf')
  form.append('type', 'pdf')
  form.append('title', 'Restricted notes')
  form.append('author', 'Test Author')
  form.append('subject', 'Circuits')
  form.append('subjectCode', 'EEE101')
  form.append('scheme', '2022')
  form.append('examYear', '2025')
  form.append('resourceType', 'question_bank')
  form.append('semester', '4')
  form.append('category', 'Lecture')
  form.append('accessType', 'restricted')
  form.append('department', 'Electronics')
  const uploadedResponse = await fetch(`${origin}/api/uploads/pdf`, { method: 'POST', headers: { Cookie: adminCookie }, body: form })
  const uploaded = await uploadedResponse.json()
  assert.equal(uploadedResponse.status, 201, JSON.stringify(uploaded))
  const resource = { response: uploadedResponse, body: uploaded }
  assert.ok(uploaded.id)
  assert.match(uploaded.filePath, /^\/api\/files\//)
  const savedResource = await request('/api/database', { cookie: adminCookie })
  assert.ok(savedResource.body.resources.some((item) => item.id === uploaded.id && item.title === 'Restricted notes' && item.category === 'Lecture'))
  const uploadedQuestionPaper = savedResource.body.resources.find((item) => item.id === uploaded.id)
  assert.equal(uploadedQuestionPaper.type, 'question_bank')
  assert.equal(uploadedQuestionPaper.subjectCode, 'EEE101')
  assert.equal(uploadedQuestionPaper.scheme, '2022')
  assert.equal(uploadedQuestionPaper.examYear, '2025')
  assert.equal(uploadedQuestionPaper.availability, 'Available')
  const pdfResponse = await fetch(`${origin}${uploaded.filePath}`, { headers: { Cookie: adminCookie } })
  assert.equal(pdfResponse.status, 200)
  assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf')
  assert.equal(await pdfResponse.text(), pdfContents)
  const pdfRangeResponse = await fetch(`${origin}${uploaded.filePath}`, { headers: { Cookie: adminCookie, Range: 'bytes=0-4' } })
  assert.equal(pdfRangeResponse.status, 206)
  assert.equal(await pdfRangeResponse.text(), '%PDF-')
  const pdfDiskPath = join(uploadPath, uploaded.filePath.split('/').at(-1))
  unlinkSync(pdfDiskPath)
  const missingPdfCatalog = await request('/api/database', { cookie: adminCookie })
  assert.equal(missingPdfCatalog.body.resources.find((item) => item.id === uploaded.id).availability, 'Missing file')
  writeFileSync(pdfDiskPath, pdfContents)
  const publicCatalog = await request('/api/database')
  assert.equal(publicCatalog.body.resources.some((item) => item.title === 'Restricted notes'), false, JSON.stringify(publicCatalog.body.resources.filter((item) => item.title === 'Restricted notes')))
  const editedPdf = await request(`/api/resources/pdf/${uploaded.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ title: 'Updated restricted notes', author: 'Updated Author', subject: 'Circuits', category: 'Reference', type: 'question_bank', subjectCode: 'EEE102', scheme: '2022 scheme', examYear: '2024', semester: '6', accessType: 'restricted', department: 'Electronics' }),
  })
  assert.equal(editedPdf.response.status, 200)
  const editedPdfResource = (await request('/api/database', { cookie: adminCookie })).body.resources.find((item) => item.id === uploaded.id)
  assert.equal(editedPdfResource.title, 'Updated restricted notes')
  assert.equal(editedPdfResource.type, 'question_bank')
  assert.equal(editedPdfResource.subjectCode, 'EEE102')
  assert.equal(editedPdfResource.scheme, '2022 scheme')
  assert.equal(editedPdfResource.examYear, '2024')
  assert.equal(editedPdfResource.filePath, uploaded.filePath)
  assert.equal((await request('/api/database')).body.resources.some((item) => item.id === uploaded.id), false)

  const videoResource = await request('/api/resources', {
    method: 'POST',
    cookie: adminCookie,
    body: JSON.stringify({ type: 'video', title: 'Circuit lesson', subject: 'Circuits', category: 'Video Lectures', department: 'Electronics', url: 'https://youtu.be/example123' }),
  })
  const externalResource = await request('/api/resources', {
    method: 'POST',
    cookie: adminCookie,
    body: JSON.stringify({ type: 'external', title: 'Course portal', subject: 'Circuits', category: 'Websites', url: 'https://example.edu/course' }),
  })
  assert.equal(videoResource.response.status, 200)
  assert.equal(externalResource.response.status, 200)
  const studentResource = await request('/api/resources', {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ type: 'external', title: 'Student-authored resource', subject: 'Power systems', category: 'Study Notes', department: 'Mathematics', url: 'https://example.edu/student-notes', accessType: 'restricted' }),
  })
  assert.equal(studentResource.response.status, 200)
  const wrongDepartmentResource = await request('/api/resources', {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ type: 'external', title: 'Wrong department resource', subject: 'Circuits', category: 'Study Notes', department: 'Electronics', url: 'https://example.edu/private', accessType: 'restricted' }),
  })
  assert.equal(wrongDepartmentResource.response.status, 403)
  const studentEditedResource = await request(`/api/resources/external/${studentResource.body.id}`, {
    method: 'PATCH',
    cookie: registration.cookie,
    body: JSON.stringify({ title: 'Updated student-authored resource', subject: 'Power systems', category: 'Study Notes', url: 'https://example.edu/student-notes-updated', accessType: 'restricted', department: 'Mathematics' }),
  })
  assert.equal(studentEditedResource.response.status, 200)
  const studentDeleteDenied = await request(`/api/resources/external/${studentResource.body.id}`, { method: 'DELETE', cookie: registration.cookie })
  assert.equal(studentDeleteDenied.response.status, 403)
  const studentUploadForm = new FormData()
  studentUploadForm.append('file', new Blob(['%PDF-1.7\nstudent upload'], { type: 'application/pdf' }), 'student-notes.pdf')
  studentUploadForm.append('resourceType', 'study_notes')
  studentUploadForm.append('title', 'Student-uploaded notes')
  studentUploadForm.append('subject', 'Power systems')
  studentUploadForm.append('category', 'Study Notes')
  studentUploadForm.append('accessType', 'restricted')
  studentUploadForm.append('department', 'Mathematics')
  const studentUploadResponse = await fetch(`${origin}/api/uploads/resource`, { method: 'POST', headers: { Cookie: registration.cookie }, body: studentUploadForm })
  const studentUpload = await studentUploadResponse.json()
  assert.equal(studentUploadResponse.status, 201, JSON.stringify(studentUpload))
  const uploadedStudentDatabase = await request('/api/database', { cookie: registration.cookie })
  const uploadedStudentResource = uploadedStudentDatabase.body.resources.find((item) => item.id === studentUpload.id)
  assert.equal(uploadedStudentResource.category, 'Study Notes')
  assert.equal(uploadedStudentResource.type, 'study_notes')
  assert.equal(uploadedStudentResource.availability, 'Available')
  assert.ok(uploadedStudentDatabase.body.resources.some((item) => item.category === 'Video Lectures' && item.type === 'video'))
  assert.ok(uploadedStudentDatabase.body.resources.some((item) => item.category === 'Websites' && item.type === 'external'))
  const downloadedStudentResource = await fetch(`${origin}${uploadedStudentResource.downloadPath}`, { headers: { Cookie: registration.cookie } })
  assert.equal(downloadedStudentResource.status, 200)
  assert.match(downloadedStudentResource.headers.get('content-disposition'), /attachment/)
  assert.match(await downloadedStudentResource.text(), /student upload/)
  const studentPdfDeleteDenied = await request(`/api/resources/document/${studentUpload.id}`, { method: 'DELETE', cookie: registration.cookie })
  assert.equal(studentPdfDeleteDenied.response.status, 403)
  const removeStudentUpload = await request(`/api/resources/document/${studentUpload.id}`, { method: 'DELETE', cookie: adminCookie })
  assert.equal(removeStudentUpload.response.status, 200, JSON.stringify(removeStudentUpload.body))
  const resourceBookmark = await request('/api/resource-favourites', {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ resourceKind: 'external', resourceId: studentResource.body.id }),
  })
  assert.equal(resourceBookmark.response.status, 200)
  const resourceActivity = await request('/api/resources/activity', {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ resourceKind: 'external', resourceId: studentResource.body.id, pageNumber: 1 }),
  })
  assert.equal(resourceActivity.response.status, 200)
  const resourceReport = await request(`/api/resources/external/${studentResource.body.id}/report`, {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ details: 'The link does not open.' }),
  })
  assert.equal(resourceReport.response.status, 200)
  const studentActivity = await request('/api/database', { cookie: registration.cookie })
  assert.ok(studentActivity.body.resourceFavourites.includes(`external:${studentResource.body.id}`))
  assert.equal(studentActivity.body.recentResources[0].resourceId, studentResource.body.id)
  assert.ok((await request('/api/database', { cookie: adminCookie })).body.notifications.some((item) => item.message.includes('The link does not open.')))
  const revokeResourcePermission = await request(`/api/admin/students/${studentId}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ resourceEditor: false }),
  })
  assert.equal(revokeResourcePermission.response.status, 200)
  const revokedEditorSession = await request('/api/auth/session', { cookie: registration.cookie })
  assert.equal(revokedEditorSession.body.user.canManageResources, false)
  const editedVideo = await request(`/api/resources/video/${videoResource.body.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ type: 'video', title: 'Updated circuit lesson', author: 'Faculty', subject: 'Circuits', category: 'Lecture', department: 'Mathematics', url: 'https://youtu.be/updated123', accessType: 'restricted' }),
  })
  assert.equal(editedVideo.response.status, 200)
  const resources = await request('/api/database', { cookie: registration.cookie })
  assert.ok(resources.body.resources.some((item) => item.type === 'video' && item.title === 'Updated circuit lesson' && item.url === 'https://youtu.be/updated123'), JSON.stringify(resources.body.resources))
  assert.ok(resources.body.resources.some((item) => item.type === 'external' && item.title === 'Course portal'))
  const deniedResourceEdit = await request(`/api/resources/video/${videoResource.body.id}`, {
    method: 'PATCH',
    cookie: registration.cookie,
    body: JSON.stringify({ title: 'Unauthorized edit', subject: 'Circuits', category: 'Lecture', url: 'https://youtu.be/updated123' }),
  })
  assert.equal(deniedResourceEdit.response.status, 403)
  const changedResourceType = await request(`/api/resources/video/${videoResource.body.id}`, {
    method: 'PATCH',
    cookie: adminCookie,
    body: JSON.stringify({ type: 'external', title: 'Updated circuit lesson', author: 'Faculty', subject: 'Circuits', category: 'Lecture', url: 'https://example.edu/circuit-lesson', accessType: 'open' }),
  })
  assert.equal(changedResourceType.response.status, 200)
  const typeChangedCatalog = await request('/api/database', { cookie: adminCookie })
  assert.equal(typeChangedCatalog.body.resources.some((item) => item.id === videoResource.body.id && item.type === 'video'), false)
  assert.ok(typeChangedCatalog.body.resources.some((item) => item.id === videoResource.body.id && item.type === 'external' && item.url === 'https://example.edu/circuit-lesson'))

  const deniedFile = await fetch(`${origin}${uploaded.filePath}`, { headers: { Cookie: registration.cookie } })
  assert.equal(deniedFile.status, 403)
  const readableFile = await fetch(`${origin}${uploaded.filePath}`, { headers: { Cookie: adminCookie } })
  assert.equal(readableFile.status, 200)
  assert.equal(readableFile.headers.get('accept-ranges'), 'bytes')
  assert.equal(readableFile.headers.get('content-length'), String(Buffer.byteLength(pdfContents)))
  assert.equal(await readableFile.text(), pdfContents)
  const firstRange = await fetch(`${origin}${uploaded.filePath}`, { headers: { Cookie: adminCookie, Range: 'bytes=0-7' } })
  assert.equal(firstRange.status, 206)
  assert.equal(firstRange.headers.get('content-range'), `bytes 0-7/${Buffer.byteLength(pdfContents)}`)
  assert.equal(await firstRange.text(), '%PDF-1.7')
  const suffixRange = await fetch(`${origin}${uploaded.filePath}`, { headers: { Cookie: adminCookie, Range: 'bytes=-8' } })
  assert.equal(suffixRange.status, 206)
  assert.equal(await suffixRange.text(), 'document')
  const invalidRange = await fetch(`${origin}${uploaded.filePath}`, { headers: { Cookie: adminCookie, Range: `bytes=${Buffer.byteLength(pdfContents)}-` } })
  assert.equal(invalidRange.status, 416)
  assert.equal(invalidRange.headers.get('content-range'), `bytes */${Buffer.byteLength(pdfContents)}`)
  const downloadableFile = await fetch(`${origin}${uploaded.filePath}?download=1`, { headers: { Cookie: adminCookie } })
  assert.match(downloadableFile.headers.get('content-disposition'), /^attachment;/)

  const removedResource = await request(`/api/resources/pdf/${resource.body.id}`, { method: 'DELETE', cookie: adminCookie })
  assert.equal(removedResource.response.status, 200)
  const removedFile = await fetch(`${origin}${uploaded.filePath}`, { headers: { Cookie: adminCookie } })
  assert.equal(removedFile.status, 404)
  const missingResource = await request('/api/resources/document/missing-resource', { method: 'DELETE', cookie: adminCookie })
  assert.equal(missingResource.response.status, 404)
  assert.ok((await request('/api/database', { cookie: adminCookie })).body.books.some((item) => item.id === book.body.id))

  const maximumFileSize = 35 * 1024 * 1024
  const maximumPdfBytes = new Uint8Array(maximumFileSize)
  maximumPdfBytes.set(new TextEncoder().encode('%PDF-1.7\n'))
  const maximumForm = new FormData()
  maximumForm.append('file', new Blob([maximumPdfBytes], { type: 'application/pdf' }), 'maximum.pdf')
  maximumForm.append('type', 'pdf')
  maximumForm.append('title', 'Maximum size PDF')
  maximumForm.append('subject', 'Testing')
  maximumForm.append('category', 'Testing')
  maximumForm.append('accessType', 'open')
  const maximumResponse = await fetch(`${origin}/api/uploads/resource`, { method: 'POST', headers: { Cookie: adminCookie }, body: maximumForm })
  const maximumResult = await maximumResponse.json()
  assert.equal(maximumResponse.status, 201, JSON.stringify(maximumResult))
  assert.equal(maximumResult.fileSize, maximumFileSize)
  const maximumFileTail = await fetch(`${origin}${maximumResult.filePath}`, {
    headers: { Cookie: adminCookie, Range: `bytes=${maximumFileSize - 8}-` },
  })
  assert.equal(maximumFileTail.status, 206)
  assert.equal(maximumFileTail.headers.get('content-range'), `bytes ${maximumFileSize - 8}-${maximumFileSize - 1}/${maximumFileSize}`)
  assert.equal((await maximumFileTail.arrayBuffer()).byteLength, 8)
  const maximumRemoved = await request(`/api/resources/document/${maximumResult.id}`, { method: 'DELETE', cookie: adminCookie })
  assert.equal(maximumRemoved.response.status, 200)

  const oversizedBytes = new Uint8Array(maximumFileSize + 1)
  oversizedBytes.set(new TextEncoder().encode('%PDF-1.7\n'))
  const oversizedForm = new FormData()
  oversizedForm.append('file', new Blob([oversizedBytes], { type: 'application/pdf' }), 'oversized.pdf')
  oversizedForm.append('type', 'pdf')
  oversizedForm.append('title', 'Oversized PDF')
  oversizedForm.append('subject', 'Testing')
  oversizedForm.append('category', 'Testing')
  oversizedForm.append('accessType', 'open')
  const oversizedResponse = await fetch(`${origin}/api/uploads/resource`, { method: 'POST', headers: { Cookie: adminCookie }, body: oversizedForm })
  assert.equal(oversizedResponse.status, 413)

  const additionalStudent = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name: 'Unaffected Student', usn: 'STU002', email: 'unaffected@example.edu', department: 'Mathematics', password: 'student-password' }),
  })
  const activeLoanForDeleteCheck = await request('/api/issues', {
    method: 'POST',
    cookie: adminCookie,
    body: JSON.stringify({ studentId, bookId: book.body.id }),
  })
  assert.equal(activeLoanForDeleteCheck.response.status, 201)
  const blockedDelete = await request(`/api/admin/students/${studentId}`, { method: 'DELETE', cookie: adminCookie })
  assert.equal(blockedDelete.response.status, 409)
  assert.match(blockedDelete.body.error, /outstanding/)
  const activeLoan = (await request('/api/database', { cookie: adminCookie })).body.issues.find((item) => item.studentId === studentId && item.status === 'issued')
  assert.ok(activeLoan)
  const closedLoan = await request(`/api/issues/${activeLoan.id}/return`, { method: 'POST', cookie: adminCookie })
  assert.equal(closedLoan.response.status, 200)
  const deniedDelete = await request(`/api/admin/students/${additionalStudent.body.user.id}`, { method: 'DELETE', cookie: additionalStudent.cookie })
  assert.equal(deniedDelete.response.status, 403)
  const historyCountBeforeDelete = database.prepare('SELECT COUNT(*) AS count FROM borrow_records WHERE student_id = ?').get(studentId).count
  const deletedStudent = await request(`/api/admin/students/${studentId}`, { method: 'DELETE', cookie: adminCookie })
  assert.equal(deletedStudent.response.status, 200)
  const deletedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'STU001', password: 'student-password', role: 'student' }),
  })
  assert.equal(deletedLogin.response.status, 401)
  const afterStudentDelete = await request('/api/database', { cookie: adminCookie })
  assert.equal(afterStudentDelete.body.users.some((user) => user.id === studentId), false)
  assert.ok(afterStudentDelete.body.users.some((user) => user.id === additionalStudent.body.user.id))
  assert.ok(afterStudentDelete.body.resources.some((item) => item.type === 'external' && item.title === 'Course portal'))
  assert.ok(afterStudentDelete.body.resources.some((item) => item.type === 'external' && item.title === 'Updated circuit lesson' && item.url === 'https://example.edu/circuit-lesson'))
  assert.ok(afterStudentDelete.body.books.some((item) => item.id === book.body.id))
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM borrow_records WHERE student_id = ?').get(studentId).count, historyCountBeforeDelete)
  assert.ok(afterStudentDelete.body.issues.some((item) => item.studentId === studentId && item.studentName === 'Updated Student' && item.studentUsn === 'STU001'))
  assert.equal((await request('/api/auth/session', { cookie: registration.cookie })).body.user, null)
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), [])
  const removedVideo = await request(`/api/resources/external/${videoResource.body.id}`, { method: 'DELETE', cookie: adminCookie })
  const removedExternal = await request(`/api/resources/external/${externalResource.body.id}`, { method: 'DELETE', cookie: adminCookie })
  assert.equal(removedVideo.response.status, 200)
  assert.equal(removedExternal.response.status, 200)
  const finalCatalog = await request('/api/database', { cookie: adminCookie })
  assert.equal(finalCatalog.body.resources.some((item) => [videoResource.body.id, externalResource.body.id].includes(item.id)), false)
  assert.ok(finalCatalog.body.books.some((item) => item.id === book.body.id))

  const studentLogout = await request('/api/auth/logout', { method: 'POST', cookie: registration.cookie })
  assert.equal(studentLogout.response.status, 200)
  assert.match(studentLogout.response.headers.get('set-cookie'), /Max-Age=0/)
  const studentSession = await request('/api/auth/session', { cookie: registration.cookie })
  assert.equal(studentSession.body.user, null)
  const studentProtected = await request('/api/issues', {
    method: 'POST',
    cookie: registration.cookie,
    body: JSON.stringify({ studentId, bookId: book.body.id }),
  })
  assert.equal(studentProtected.response.status, 401)

  const librarianLogout = await request('/api/auth/logout', { method: 'POST', cookie: adminCookie })
  assert.equal(librarianLogout.response.status, 200)
  const librarianProtected = await request('/api/admin/settings', { cookie: adminCookie })
  assert.equal(librarianProtected.response.status, 401)
})

test('uploads, previews, edits, secures, and deletes managed office resources', async () => {
  const testDatabase = createDatabase(':memory:')
  const testUploadPath = mkdtempSync(join(tmpdir(), 'libraai-document-test-'))
  const geminiRequests = []
  const availableGeminiModels = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
  let transientGenerationFailures = 0
  let generationError = null
  const { server: testServer } = createLibraryServer({
    database: testDatabase,
    uploadPath: testUploadPath,
    officeConverter: async (_sourcePath, previewPath) => writeFileSync(previewPath, '%PDF-1.7\nconverted office preview'),
    fetchGemini: async (input, options = {}) => {
      const requestUrl = new URL(input)
      geminiRequests.push({ url: requestUrl, method: options.method ?? 'GET', headers: options.headers ?? {}, body: options.body })
      if (requestUrl.pathname === '/v1beta/models') {
        return new Response(JSON.stringify({
          models: availableGeminiModels.map((name) => ({ name: `models/${name}`, supportedGenerationMethods: ['generateContent'] })),
        }), { status: 200 })
      }
      if (requestUrl.pathname.endsWith(':generateContent')) {
        if (generationError) return new Response(JSON.stringify({ error: generationError }), { status: generationError.code })
        if (transientGenerationFailures > 0) {
          transientGenerationFailures -= 1
          return new Response(JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'Temporary model capacity.' } }), {
            status: 503,
            headers: { 'Retry-After': '0.01' },
          })
        }
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '# Simple overview\nTest-grounded study summary.' }] } }] }), { status: 200 })
      }
      if (options.method === 'DELETE') return new Response(null, { status: 200 })
      throw new Error(`Unexpected Gemini API request: ${options.method ?? 'GET'} ${requestUrl.pathname}`)
    },
  })
  await new Promise((resolve) => testServer.listen(0, '127.0.0.1', resolve))
  const testOrigin = `http://127.0.0.1:${testServer.address().port}`
  async function testRequest(path, { cookie, ...options } = {}) {
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...options.headers }
    const response = await fetch(`${testOrigin}${path}`, { ...options, headers })
    return { response, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    const admin = await testRequest('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({ name: 'Document Librarian', usn: 'DOC001', email: 'documents@example.edu', password: 'secure-password' }),
    })
    const matchingStudent = await testRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Matching Student', usn: 'DOCSTU1', email: 'matching@example.edu', department: 'Computer Science', password: 'student-password' }),
    })
    const otherStudent = await testRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: 'Other Student', usn: 'DOCSTU2', email: 'other@example.edu', department: 'Mathematics', password: 'student-password' }),
    })
    assert.equal(admin.response.status, 200)

    const categoryUploadSpecs = [
      { category: 'E-Books', type: 'pdf', fileName: 'ebook.pdf', contents: createTextPdf('Ohms law states that voltage equals current times resistance. The summary should include Ohms law and electrical engineering revision notes.') },
      { category: 'Question Papers', type: 'question_bank', fileName: 'paper.pdf', contents: '%PDF-1.7\nquestion paper', subjectCode: 'EEE201', scheme: '2022', examYear: '2025', semester: '4' },
      { category: 'Study Notes', type: 'study_notes', fileName: 'notes.pdf', contents: '%PDF-1.7\nstudy notes' },
      { category: 'Lab Manuals', type: 'lab_manual', fileName: 'lab.pdf', contents: '%PDF-1.7\nlab manual' },
      { category: 'PPTs', type: 'ppt', fileName: 'slides.pptx', contents: 'PK\u0003\u0004presentation' },
    ]
    for (const [index, spec] of categoryUploadSpecs.entries()) {
      const categoryForm = new FormData()
      categoryForm.append('file', new Blob([spec.contents], { type: spec.fileName.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : 'application/pdf' }), spec.fileName)
      categoryForm.append('title', `Category test ${index}`)
      categoryForm.append('subject', 'Circuits')
      categoryForm.append('resourceType', spec.type)
      categoryForm.append('category', spec.category)
      categoryForm.append('uploadKey', `category-upload-${index}`)
      if (spec.subjectCode) categoryForm.append('subjectCode', spec.subjectCode)
      if (spec.scheme) categoryForm.append('scheme', spec.scheme)
      if (spec.examYear) categoryForm.append('examYear', spec.examYear)
      if (spec.semester) categoryForm.append('semester', spec.semester)
      const response = await fetch(`${testOrigin}/api/uploads/resource`, { method: 'POST', headers: { Cookie: admin.cookie }, body: categoryForm })
      const firstResult = await response.json()
      assert.equal(response.status, 201, `${spec.category}: ${JSON.stringify(firstResult)}`)
      if (spec.type === 'pdf') {
        const repeatForm = new FormData()
        repeatForm.append('file', new Blob([spec.contents], { type: 'application/pdf' }), spec.fileName)
        repeatForm.append('title', `Category test ${index}`)
        repeatForm.append('subject', 'Circuits')
        repeatForm.append('resourceType', spec.type)
        repeatForm.append('category', spec.category)
        repeatForm.append('uploadKey', `category-upload-${index}`)
        const repeatedResponse = await fetch(`${testOrigin}/api/uploads/resource`, { method: 'POST', headers: { Cookie: admin.cookie }, body: repeatForm })
        const repeatedResult = await repeatedResponse.json()
        assert.equal(repeatedResponse.status, 200)
        assert.equal(repeatedResult.duplicate, true)
        assert.equal(repeatedResult.id, firstResult.id)
      }
    }
    for (const [index, spec] of [
      { category: 'Video Lectures', type: 'video', url: 'https://example.edu/video' },
      { category: 'Websites', type: 'external', url: 'https://example.edu/website' },
    ].entries()) {
      const response = await testRequest('/api/resources', {
        method: 'POST',
        cookie: admin.cookie,
        body: JSON.stringify({ ...spec, title: `Category link ${index}`, subject: 'Circuits' }),
      })
      assert.equal(response.response.status, 200)
    }
    const categoryResources = (await testRequest('/api/database', { cookie: admin.cookie })).body.resources
    for (const spec of [...categoryUploadSpecs, { category: 'Video Lectures', type: 'video' }, { category: 'Websites', type: 'external' }]) {
      assert.ok(categoryResources.some((resource) => resource.category === spec.category && resource.type === spec.type), `${spec.category} ${spec.type} resource should be saved and listed`)
    }

    const pdfResource = categoryResources.find((resource) => resource.title === 'Category test 0')
    assert.ok(pdfResource)
    const restrictedPdf = await testRequest(`/api/resources/document/${pdfResource.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: JSON.stringify({ title: pdfResource.title, subject: pdfResource.subject, category: pdfResource.category, accessType: 'restricted', department: 'Computer Science' }),
    })
    assert.equal(restrictedPdf.response.status, 200)
    const unauthenticatedSummary = await testRequest(`/api/resources/document/${pdfResource.id}/summary`, { method: 'POST' })
    assert.equal(unauthenticatedSummary.response.status, 401)
    const forbiddenSummary = await testRequest(`/api/resources/document/${pdfResource.id}/summary`, { method: 'POST', cookie: otherStudent.cookie })
    assert.equal(forbiddenSummary.response.status, 403)
    assert.equal(geminiRequests.length, 0)

    const previousGeminiKey = process.env.GEMINI_API_KEY
    const previousGeminiModel = process.env.GEMINI_MODEL
    try {
      delete process.env.GEMINI_API_KEY
      const unconfiguredSummary = await testRequest(`/api/resources/document/${pdfResource.id}/summary`, { method: 'POST', cookie: matchingStudent.cookie })
      assert.equal(unconfiguredSummary.response.status, 503)
      assert.match(unconfiguredSummary.body.error, /Railway project administrator.*GEMINI_API_KEY/)
      const unconfiguredUploadForm = new FormData()
      unconfiguredUploadForm.append('file', new Blob([createTextPdf('Notes about electrical engineering voltage current resistance.')], { type: 'application/pdf' }), 'notes.pdf')
      const unconfiguredUpload = await fetch(`${testOrigin}/api/ai/summarize-upload`, {
        method: 'POST',
        headers: { Cookie: matchingStudent.cookie },
        body: unconfiguredUploadForm,
      })
      assert.equal(unconfiguredUpload.status, 503)
      assert.match((await unconfiguredUpload.json()).error, /Railway project administrator.*GEMINI_API_KEY/)
      assert.equal(geminiRequests.length, 0)

      process.env.GEMINI_API_KEY = 'test-gemini-api-key'
      process.env.GEMINI_MODEL = 'gemini-2.0-flash'
      const unauthenticatedUploadForm = new FormData()
      unauthenticatedUploadForm.append('file', new Blob([createTextPdf('Notes about electrical engineering voltage current resistance.')], { type: 'application/pdf' }), 'notes.pdf')
      const unauthenticatedUpload = await fetch(`${testOrigin}/api/ai/summarize-upload`, { method: 'POST', body: unauthenticatedUploadForm })
      assert.equal(unauthenticatedUpload.status, 401)
      const unsupportedUploadForm = new FormData()
      unsupportedUploadForm.append('file', new Blob(['not a PDF'], { type: 'text/plain' }), 'notes.txt')
      const unsupportedUpload = await fetch(`${testOrigin}/api/ai/summarize-upload`, {
        method: 'POST',
        headers: { Cookie: matchingStudent.cookie },
        body: unsupportedUploadForm,
      })
      assert.equal(unsupportedUpload.status, 400)

      const summarized = await testRequest(`/api/resources/document/${pdfResource.id}/summary`, { method: 'POST', cookie: matchingStudent.cookie })
      assert.equal(summarized.response.status, 200, JSON.stringify(summarized.body))
      assert.match(summarized.body.summary, /Test-grounded study summary/)
      assert.doesNotMatch(JSON.stringify(summarized.body), /test-gemini-api-key/)
      assert.equal(geminiRequests[0].method, 'GET')
      assert.equal(geminiRequests[0].url.pathname, '/v1beta/models')
      assert.equal(geminiRequests[0].headers['x-goog-api-key'], 'test-gemini-api-key')
      const generationRequest = geminiRequests.find((item) => item.url.pathname.endsWith(':generateContent'))
      assert.ok(generationRequest)
      assert.match(generationRequest.url.pathname, /models\/gemini-2\.5-flash:generateContent$/)
      assert.equal(generationRequest.headers['x-goog-api-key'], 'test-gemini-api-key')
      assert.match(generationRequest.body.toString(), /Ohms law states that voltage equals current times resistance/i)
      assert.ok(testDatabase.prepare('SELECT id FROM document_resources WHERE id = ?').get(pdfResource.id))

      transientGenerationFailures = 1
      const retriedSummary = await testRequest(`/api/resources/document/${pdfResource.id}/summary`, { method: 'POST', cookie: matchingStudent.cookie })
      assert.equal(retriedSummary.response.status, 200, JSON.stringify(retriedSummary.body))
      assert.match(retriedSummary.body.summary, /Test-grounded study summary/)

      generationError = { code: 404, status: 'NOT_FOUND', message: 'This model is no longer available. Choose an active model.' }
      const requestsBeforeDetailedFailure = geminiRequests.length
      const detailedGeminiFailure = await testRequest(`/api/resources/document/${pdfResource.id}/summary`, { method: 'POST', cookie: matchingStudent.cookie })
      assert.equal(detailedGeminiFailure.response.status, 502)
      assert.match(detailedGeminiFailure.body.error, /Gemini summary generation with model gemini-2\.5-flash-lite failed \(HTTP 404/)
      assert.match(detailedGeminiFailure.body.error, /This model is no longer available/)
      assert.doesNotMatch(detailedGeminiFailure.body.error, /test-gemini-api-key/)
      assert.deepEqual(
        geminiRequests.slice(requestsBeforeDetailedFailure).filter((item) => item.url.pathname.endsWith(':generateContent')).map((item) => item.url.pathname),
        ['/v1beta/models/gemini-2.5-flash:generateContent', '/v1beta/models/gemini-2.5-flash-lite:generateContent'],
      )
      generationError = null

      const beforeTransientUpload = readdirSync(testUploadPath).sort()
      const transientPdf = new FormData()
      transientPdf.append('file', new Blob([createTextPdf('Transient engineering notes about Ohms law and electrical circuits.')], { type: 'application/pdf' }), 'transient-notes.pdf')
      const transientResponse = await fetch(`${testOrigin}/api/ai/summarize-upload`, {
        method: 'POST',
        headers: { Cookie: matchingStudent.cookie },
        body: transientPdf,
      })
      const transientResult = await transientResponse.json()
      assert.equal(transientResponse.status, 200, JSON.stringify(transientResult))
      assert.match(transientResult.summary, /Test-grounded study summary/)
      assert.deepEqual(readdirSync(testUploadPath).sort(), beforeTransientUpload)
      assert.ok(testDatabase.prepare('SELECT id FROM document_resources WHERE id = ?').get(pdfResource.id))

      const librarianTransientPdf = new FormData()
      librarianTransientPdf.append('file', new Blob([createTextPdf('Librarian engineering notes about transformers and electrical power.')], { type: 'application/pdf' }), 'librarian-notes.pdf')
      const librarianTransientResponse = await fetch(`${testOrigin}/api/ai/summarize-upload`, {
        method: 'POST',
        headers: { Cookie: admin.cookie },
        body: librarianTransientPdf,
      })
      assert.equal(librarianTransientResponse.status, 200)
    } finally {
      if (previousGeminiKey === undefined) delete process.env.GEMINI_API_KEY
      else process.env.GEMINI_API_KEY = previousGeminiKey
      if (previousGeminiModel === undefined) delete process.env.GEMINI_MODEL
      else process.env.GEMINI_MODEL = previousGeminiModel
    }

    const originalBytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('office document contents')])
    const form = new FormData()
    form.append('file', new Blob([originalBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'lecture-notes.docx')
    form.append('title', 'Lecture notes')
    form.append('author', 'Library Team')
    form.append('subject', 'Algorithms')
    form.append('category', 'Course material')
    form.append('semester', '4')
    form.append('accessType', 'restricted')
    form.append('department', 'Computer Science')
    const uploadResponse = await fetch(`${testOrigin}/api/uploads/resource`, { method: 'POST', headers: { Cookie: admin.cookie }, body: form })
    const upload = await uploadResponse.json()
    assert.equal(uploadResponse.status, 201, JSON.stringify(upload))
    assert.equal(upload.fileType, 'docx')

    const librarianCatalog = await testRequest('/api/database', { cookie: admin.cookie })
    const savedResource = librarianCatalog.body.resources.find((resource) => resource.id === upload.id)
    assert.equal(savedResource.title, 'Lecture notes')
    assert.equal(savedResource.author, 'Library Team')
    assert.equal(savedResource.subject, 'Algorithms')
    assert.equal(savedResource.category, 'Course material')
    assert.equal(savedResource.type, 'study_notes')
    assert.equal(savedResource.fileType, 'docx')
    assert.equal(savedResource.fileSize, originalBytes.length)
    assert.equal(savedResource.availability, 'Available')
    const studentCatalog = await testRequest('/api/database', { cookie: matchingStudent.cookie })
    assert.ok(studentCatalog.body.resources.some((resource) => resource.id === upload.id))
    const filteredCatalog = await testRequest('/api/database', { cookie: otherStudent.cookie })
    assert.equal(filteredCatalog.body.resources.some((resource) => resource.id === upload.id), false)

    const preview = await fetch(`${testOrigin}${savedResource.previewPath}`, { headers: { Cookie: matchingStudent.cookie } })
    assert.equal(preview.status, 200)
    assert.equal(preview.headers.get('content-type'), 'application/pdf')
    assert.match(await preview.text(), /^%PDF-1\.7/)
    const previewRange = await fetch(`${testOrigin}${savedResource.previewPath}`, { headers: { Cookie: matchingStudent.cookie, Range: 'bytes=0-4' } })
    assert.equal(previewRange.status, 206)
    assert.equal(await previewRange.text(), '%PDF-')
    const original = await fetch(`${testOrigin}${savedResource.downloadPath}`, { headers: { Cookie: matchingStudent.cookie } })
    assert.equal(original.status, 200)
    assert.deepEqual(Buffer.from(await original.arrayBuffer()), originalBytes)
    assert.match(original.headers.get('content-disposition'), /lecture-notes\.docx/)
    const deniedOriginal = await fetch(`${testOrigin}${savedResource.downloadPath}`, { headers: { Cookie: otherStudent.cookie } })
    assert.equal(deniedOriginal.status, 403)

    const edited = await testRequest(`/api/resources/document/${upload.id}`, {
      method: 'PATCH',
      cookie: admin.cookie,
      body: JSON.stringify({ title: 'Updated lecture notes', author: 'Faculty', subject: 'Algorithms', category: 'References', semester: '5', accessType: 'open' }),
    })
    assert.equal(edited.response.status, 200)
    assert.ok((await testRequest('/api/database', { cookie: admin.cookie })).body.resources.some((resource) => resource.id === upload.id && resource.title === 'Updated lecture notes' && resource.author === 'Faculty'))

    const previousOriginalPath = join(testUploadPath, savedResource.storedName)
    const previousPreviewPath = join(testUploadPath, savedResource.previewName)
    const replacementBytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('replacement office document')])
    const replacementForm = new FormData()
    replacementForm.append('file', new Blob([replacementBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), 'replacement-notes.docx')
    replacementForm.append('id', upload.id)
    replacementForm.append('title', 'Replaced lecture notes')
    replacementForm.append('author', 'Faculty')
    replacementForm.append('subject', 'Algorithms')
    replacementForm.append('category', 'References')
    replacementForm.append('semester', '5')
    replacementForm.append('accessType', 'open')
    const replacementResponse = await fetch(`${testOrigin}/api/uploads/resource`, { method: 'POST', headers: { Cookie: admin.cookie }, body: replacementForm })
    const replacement = await replacementResponse.json()
    assert.equal(replacementResponse.status, 200, JSON.stringify(replacement))
    assert.equal(replacement.id, upload.id)
    assert.equal(existsSync(previousOriginalPath), false)
    assert.equal(existsSync(previousPreviewPath), false)
    const replacedResource = (await testRequest('/api/database', { cookie: admin.cookie })).body.resources.find((resource) => resource.id === upload.id)
    assert.equal(replacedResource.title, 'Replaced lecture notes')
    assert.equal(replacedResource.originalName, 'replacement-notes.docx')
    assert.equal(replacedResource.fileSize, replacementBytes.length)
    assert.equal((await testRequest('/api/database', { cookie: admin.cookie })).body.resources.filter((resource) => resource.id === upload.id).length, 1)

    const deniedEdit = await testRequest(`/api/resources/document/${upload.id}`, {
      method: 'PATCH',
      cookie: matchingStudent.cookie,
      body: JSON.stringify({ title: 'Not allowed', subject: 'Algorithms', category: 'References' }),
    })
    assert.equal(deniedEdit.response.status, 403)
    const deniedUpload = await fetch(`${testOrigin}/api/uploads/resource`, { method: 'POST', headers: { Cookie: matchingStudent.cookie } })
    assert.equal(deniedUpload.status, 403)

    const diskOriginal = join(testUploadPath, replacedResource.storedName)
    const diskPreview = join(testUploadPath, replacedResource.previewName)
    assert.equal((await testRequest(`/api/resources/document/${upload.id}`, { method: 'DELETE', cookie: matchingStudent.cookie })).response.status, 403)
    const deleted = await testRequest(`/api/resources/document/${upload.id}`, { method: 'DELETE', cookie: admin.cookie })
    assert.equal(deleted.response.status, 200)
    assert.equal(existsSync(diskOriginal), false)
    assert.equal(existsSync(diskPreview), false)
    assert.equal((await testRequest('/api/database', { cookie: admin.cookie })).body.resources.some((resource) => resource.id === upload.id), false)
  } finally {
    await new Promise((resolve) => testServer.close(resolve))
    testDatabase.close()
    rmSync(testUploadPath, { recursive: true, force: true })
  }
})

test('migrates earlier SQLite catalog and resource schemas', () => {
  const legacyPath = join(uploadPath, 'legacy.sqlite')
  const legacy = new DatabaseSync(legacyPath)
  legacy.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, usn TEXT, email TEXT, department TEXT, role TEXT, semester TEXT, mobile TEXT, password_hash TEXT, active INTEGER, created_at TEXT);
    CREATE TABLE books (id TEXT PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, isbn TEXT NOT NULL, subject TEXT, department TEXT, category TEXT, collection TEXT, publisher TEXT, edition TEXT, publicationYear TEXT, language TEXT, pages INTEGER, description TEXT, keywords TEXT, coverImage TEXT, accessionNumber TEXT, rackNumber TEXT, shelfNumber TEXT, accessStatus TEXT, status TEXT, totalCopies INTEGER, created_at TEXT);
    CREATE TABLE pdf_resources (id TEXT PRIMARY KEY, title TEXT, author TEXT, subject TEXT, description TEXT, category TEXT, publication_year TEXT, upload_date TEXT, access_type TEXT, file_path TEXT);
    CREATE TABLE video_resources (id TEXT PRIMARY KEY, title TEXT, author TEXT, subject TEXT, description TEXT, category TEXT, video_url TEXT, thumbnail TEXT, access_type TEXT);
    CREATE TABLE external_resources (id TEXT PRIMARY KEY, title TEXT, author TEXT, subject TEXT, description TEXT, category TEXT, website_url TEXT, access_type TEXT);
    CREATE TABLE book_copies (id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id), accession_number TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'available');
    CREATE TABLE borrow_records (
      id TEXT PRIMARY KEY, student_id TEXT NOT NULL REFERENCES users(id), book_id TEXT NOT NULL REFERENCES books(id),
      copy_id TEXT REFERENCES book_copies(id), issue_date TEXT NOT NULL, due_date TEXT NOT NULL,
      return_date TEXT, status TEXT NOT NULL CHECK (status IN ('requested', 'issued', 'rejected', 'returned')),
      fine INTEGER NOT NULL DEFAULT 0
    );
    INSERT INTO users (id, name, usn, email, department, role, semester, mobile, password_hash, active, created_at)
      VALUES ('legacy-student', 'Legacy Student', 'OLD001', 'legacy@example.edu', 'Computer Science', 'student', '5', '5550100', 'hash', 1, CURRENT_TIMESTAMP);
    INSERT INTO books (id, title, author, isbn, totalCopies) VALUES ('legacy-book', 'Legacy Book', 'Legacy Author', '9780000000009', 1);
    INSERT INTO borrow_records (id, student_id, book_id, issue_date, due_date, return_date, status, fine)
      VALUES ('legacy-record', 'legacy-student', 'legacy-book', '2024-01-01', '2024-01-15', '2024-01-12', 'returned', 0);
  `)
  legacy.close()

  const migrated = createDatabase(legacyPath)
  const columns = (table) => new Set(migrated.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name))
  assert.ok(columns('books').has('category_id'))
  assert.ok(columns('book_copies').has('status'))
  assert.ok(columns('pdf_resources').has('resource_type'))
  assert.ok(columns('pdf_resources').has('file_size'))
  assert.ok(columns('pdf_resources').has('subject_code'))
  assert.ok(columns('document_resources').has('stored_name'))
  assert.ok(columns('document_resources').has('resource_type'))
  assert.ok(columns('video_resources').has('department'))
  assert.ok(columns('external_resources').has('semester'))
  assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM borrow_records WHERE id = ?').get('legacy-record').count, 1)
  const preservedRecord = migrated.prepare('SELECT student_name, student_usn, status FROM borrow_records WHERE id = ?').get('legacy-record')
  assert.deepEqual({ ...preservedRecord }, { student_name: 'Legacy Student', student_usn: 'OLD001', status: 'returned' })
  assert.equal(migrated.prepare('PRAGMA foreign_key_list(borrow_records)').all().some((key) => key.table === 'users'), false)
  migrated.close()
})