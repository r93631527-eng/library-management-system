import { useEffect, useState } from 'react'
import {
  AlertTriangle, ArrowDownLeft, ArrowUpRight, BookOpen, CircleDollarSign,
  Check, Download, FilePlus2, KeyRound, LibraryBig, LoaderCircle, Pencil, Plus, RotateCcw, Trash2, Users, X,
} from 'lucide-react'
import { Badge, Button, EmptyState, Modal, PageHeader, SearchBox, StatCard } from '../components/Layout'
import { useApp } from '../context/useApp'
import { resourceCategories, resourceTypeByCategory } from '../resourceCategories'
import { PdfViewer } from './StudentPages'
import * as api from '../services/api'

const prettyDate = (date) => date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const activityDate = (issue) => issue.returnDate || issue.issueDate || ''
const dayDifference = (date) => {
  const today = new Date().toISOString().slice(0, 10)
  return Math.ceil((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
}
const resourceTypes = {
  pdf: 'E-Books / PDFs',
  question_bank: 'Question Papers',
  video: 'Video Lectures',
  study_notes: 'Study Notes',
  ppt: 'PPT / Presentations',
  lab_manual: 'Lab Manuals',
  external: 'External Website Links',
  doc: 'DOC', docx: 'DOCX', pptx: 'PPTX', odt: 'ODT', odp: 'ODP', rtf: 'RTF', txt: 'Text',
}
const fileResourceTypes = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'odt', 'odp', 'rtf', 'txt']
const resourceFileCategories = ['pdf', 'question_bank', 'study_notes', 'ppt', 'lab_manual']
const resourceCategoryOptions = ['pdf', 'question_bank', 'video', 'study_notes', 'ppt', 'lab_manual', 'external']
const acceptedResourceFiles = '.pdf,.doc,.docx,.ppt,.pptx,.odt,.odp,.rtf,.txt'
const maximumResourceSize = 35 * 1024 * 1024
const formatFileSize = (size) => size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / (1024 * 1024)).toFixed(2)} MB`

function ActionIcon({ title, onClick, children, danger = false }) {
  return <button type="button" className={`icon-button ${danger ? 'text-red-500 hover:bg-red-50' : ''}`} title={title} aria-label={title} onClick={onClick}>{children}</button>
}

export function AdminDashboard() {
  const { database, notify, refresh, user } = useApp()
  const [recoveryCode, setRecoveryCode] = useState('')
  const issued = database.issues.filter((issue) => issue.status === 'issued')
  const overdue = issued.filter((issue) => dayDifference(issue.dueDate) < 0)
  const students = database.users.filter((item) => item.role === 'student')
  const bookById = (id) => database.books.find((item) => item.id === id)
  const userById = (id) => database.users.find((item) => item.id === id)

  async function reset() {
    if (!window.confirm('Reset sample books and circulation? This clears borrowing history but keeps registered accounts and digital resources.')) return
    try {
      await api.resetLibraryData()
      await refresh()
      notify('Sample books restored; digital resources were kept.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  async function generateRecoveryCode() {
    try {
      setRecoveryCode(await api.createLibrarianRecoveryCode())
      await refresh()
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  return <>
    <PageHeader eyebrow="Library overview" title="A good day to organize." description="Your collection and circulation at a glance." action={<div className="flex flex-col gap-2 sm:flex-row"><Button variant="secondary" onClick={generateRecoveryCode}><KeyRound size={15} /> Recovery code</Button><Button variant="secondary" onClick={reset}><RotateCcw size={15} /> Reset sample data</Button></div>} />
    <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Total books" value={database.books.reduce((sum, book) => sum + Number(book.totalCopies || 0), 0)} note={`${database.books.length} unique titles`} icon={LibraryBig} />
      <StatCard label="Books on loan" value={issued.length} note="currently checked out" icon={ArrowUpRight} tint="lime" />
      <StatCard label="Overdue" value={overdue.length} note="need a gentle reminder" icon={AlertTriangle} tint={overdue.length ? 'rose' : 'blue'} />
      <StatCard label="Students" value={students.length} note="registered members" icon={Users} tint="blue" />
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_.8fr]">
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-5 sm:px-6"><div><h2 className="font-display text-base font-semibold">Latest circulation</h2><p className="mt-1 text-[11px] text-muted">Recent issue and return activity</p></div><span className="rounded-full bg-[#f2f5f1] px-2.5 py-1 text-[10px] font-medium text-muted">{database.issues.length} records</span></div>
        {database.issues.length ? <div className="divide-y divide-[#edf0ec]">
          {[...database.issues].sort((a, b) => activityDate(b).localeCompare(activityDate(a))).slice(0, 5).map((issue) => {
            const book = bookById(issue.bookId)
            const student = userById(issue.studentId)
            const isOverdue = issue.status === 'issued' && dayDifference(issue.dueDate) < 0
            const activity = issue.status === 'requested' ? 'requested' : issue.status === 'returned' ? 'returned' : 'borrowed'
            return <div key={issue.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
              <div className="avatar avatar-soft">{(student?.name ?? issue.studentName ?? '?').slice(0, 1)}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{student?.name ?? issue.studentName ?? 'Unknown student'} <span className="font-normal text-muted">{activity}</span> {book?.title ?? 'Removed book'}</p><p className="mt-1 text-[10px] text-muted">{issue.status === 'returned' ? `Issued ${prettyDate(issue.issueDate)} · Returned ${prettyDate(issue.returnDate)}` : issue.status === 'requested' ? `Requested ${prettyDate(issue.requestDate || issue.issueDate)}` : `Issued ${prettyDate(issue.issueDate)} · Due ${prettyDate(issue.dueDate)}`}</p></div>
              <Badge tone={issue.status === 'requested' ? 'blue' : issue.status === 'rejected' || issue.status === 'returned' ? 'neutral' : isOverdue ? 'danger' : 'success'}>{issue.status === 'requested' ? 'Requested' : issue.status === 'rejected' ? 'Declined' : issue.status === 'returned' ? 'Returned' : isOverdue ? 'Overdue' : 'Issued'}</Badge>
            </div>
          })}
        </div> : <div className="p-5"><EmptyState title="No circulation yet" description="When a student borrows a book, it will show up here." icon={BookOpen} /></div>}
      </section>
      <section className="card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-base font-semibold">Collection health</h2><p className="mt-1 text-[11px] text-muted">Availability by the numbers</p></div><BookOpen size={18} className="text-forest" /></div>
        <div className="mb-4 flex items-end justify-between"><span className="text-xs text-muted">Available copies</span><strong className="font-display text-xl">{database.books.reduce((sum, book) => sum + Number(book.availableCopies || 0), 0)}<span className="text-xs font-normal text-muted"> / {database.books.reduce((sum, book) => sum + Number(book.totalCopies || 0), 0)}</span></strong></div>
        <div className="h-2 overflow-hidden rounded-full bg-[#edf1ec]"><div className="h-full rounded-full bg-forest transition-all" style={{ width: `${database.books.reduce((sum, book) => sum + Number(book.totalCopies || 0), 0) ? (database.books.reduce((sum, book) => sum + Number(book.availableCopies || 0), 0) / database.books.reduce((sum, book) => sum + Number(book.totalCopies || 0), 0)) * 100 : 0}%` }} /></div>
        <p className="mt-2 text-[10px] text-muted">Copies on shelf and ready for a new reader</p>
        <div className="mt-6 border-t border-[#edf0ec] pt-5">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-xs"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#edf5ef] text-forest"><ArrowDownLeft size={14} /></span>On loan</div><span className="text-xs font-semibold">{issued.length} copies</span></div>
          <div className="mt-4 flex items-center justify-between"><div className="flex items-center gap-2 text-xs"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#fff3e8] text-[#c88042]"><AlertTriangle size={14} /></span>Overdue returns</div><span className={`text-xs font-semibold ${overdue.length ? 'text-red-600' : ''}`}>{overdue.length} {overdue.length === 1 ? 'book' : 'books'}</span></div>
        </div>
      </section>
    </div>
    {recoveryCode && <Modal title="Save your librarian recovery code" description="This code can reset your librarian password once. Generating another code will invalidate this one." onClose={() => setRecoveryCode('')}>
      <div className="space-y-4 p-5 sm:p-7">
        <p className="text-xs leading-5 text-muted">Keep this code somewhere private. Anyone with access to this browser and the code can reset this librarian account.</p>
        <p className="text-xs text-muted">Sign-in ID: <strong className="text-ink">{user.usn}</strong> <span className="px-1">·</span> Email: <strong className="text-ink">{user.email}</strong></p>
        <div className="select-all rounded-xl border border-[#e5ebe4] bg-[#f7f9f6] px-4 py-4 text-center font-mono text-lg font-bold tracking-[.15em] text-forest">{recoveryCode}</div>
        <div className="flex justify-end"><Button onClick={() => setRecoveryCode('')}>I saved the code</Button></div>
      </div>
    </Modal>}
  </>
}

const blankBook = {
  title: '', author: '', isbn: '', subject: '', department: '', category: '', collection: '',
  publisher: '', edition: '', publicationYear: '', language: '', pages: '', description: '',
  keywords: '', coverImage: '', accessionNumber: '', rackNumber: '', shelfNumber: '',
  accessStatus: 'Open Access', status: 'Available', totalCopies: 1, availableCopies: 1,
}
export function ManageBooks() {
  const { database, refresh, notify } = useApp()
  const [query, setQuery] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blankBook)
  const [error, setError] = useState('')
  const visible = database.books.filter((book) => `${book.title} ${book.author} ${book.isbn} ${book.subject} ${book.department} ${book.category} ${book.collection} ${book.keywords}`.toLowerCase().includes(query.toLowerCase().trim()))
  function openForm(book = null) {
    setEditing(book)
    const activeCopies = book ? database.issues.filter((issue) => issue.bookId === book.id && issue.status === 'issued').length : 0
    setForm(book ? { ...blankBook, ...book, availableCopies: book.totalCopies - activeCopies } : { ...blankBook })
    setError('')
    setModal(true)
  }
  async function submit(event) {
    event.preventDefault()
    const total = Number(form.totalCopies)
    const activeCopies = editing ? database.issues.filter((issue) => issue.bookId === editing.id && issue.status === 'issued').length : 0
    if (!form.title.trim() || !form.author.trim() || !form.isbn.trim() || !form.category.trim()) return setError('Complete every book detail before saving.')
    if (!Number.isInteger(total) || total < 1 || total < activeCopies) return setError(`Total copies must be a whole number and cannot be less than the ${activeCopies} active ${activeCopies === 1 ? 'loan' : 'loans'}.`)
    if (form.publicationYear && !/^\d{4}$/.test(String(form.publicationYear))) return setError('Publication year must contain four digits.')
    if (form.pages && (!Number.isInteger(Number(form.pages)) || Number(form.pages) < 1)) return setError('Number of pages must be a positive whole number.')
    if (database.books.some((book) => book.isbn.toLowerCase() === form.isbn.trim().toLowerCase() && book.id !== editing?.id)) return setError('A book with this ISBN already exists.')
    try {
      await api.saveBook({ ...form, id: editing?.id ?? crypto.randomUUID(), totalCopies: total, availableCopies: total - activeCopies })
      await refresh()
      setModal(false)
      notify(editing ? 'Book details updated.' : 'Book added to the collection.')
    } catch (issue) {
      setError(issue.message)
    }
  }
  async function remove(book) {
    if (database.issues.some((issue) => issue.bookId === book.id && issue.status === 'issued')) return notify('This title has an active issue and cannot be deleted yet.', 'error')
    if (!window.confirm(`Delete “${book.title}” from the collection?`)) return
    try {
      await api.deleteBook(book.id)
      await refresh()
      notify('Book deleted.')
    } catch (issue) {
      notify(issue.message, 'error')
    }
  }
  return <>
    <PageHeader eyebrow="Collection care" title="Manage books." description="Add titles, keep copies up to date and care for your shelves." action={<Button onClick={() => openForm()}><Plus size={16} /> Add a book</Button>} />
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#edf0ec] px-4 py-4 sm:flex-row sm:items-center sm:px-6"><SearchBox value={query} onChange={setQuery} placeholder="Search title, author or ISBN..." /><span className="text-xs text-muted sm:ml-auto">{visible.length} titles</span></div>
      {visible.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Title</th><th>ISBN</th><th>Category</th><th>Copies</th><th>Availability</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{visible.map((book) => <tr key={book.id}><td><div className="font-semibold text-ink">{book.title}</div><div className="mt-1 text-[10px] text-muted">{book.author}</div></td><td className="text-xs text-muted">{book.isbn}</td><td><Badge>{book.category}</Badge></td><td className="text-xs font-medium">{book.totalCopies}</td><td><span className={`text-xs font-semibold ${book.availableCopies ? 'text-forest' : 'text-red-600'}`}>{book.availableCopies} of {book.totalCopies} available</span></td><td><div className="flex justify-end gap-1"><ActionIcon title="Edit book" onClick={() => openForm(book)}><Pencil size={15} /></ActionIcon><ActionIcon title="Delete book" danger onClick={() => remove(book)}><Trash2 size={15} /></ActionIcon></div></td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title={query ? 'No matching books' : 'Your shelves are waiting'} description={query ? 'Try another title, author or ISBN.' : 'Add your first title to get the collection started.'} icon={BookOpen} action={!query && <Button onClick={() => openForm()}><Plus size={15} /> Add a book</Button>} /></div>}
    </div>
    {modal && <Modal title={editing ? 'Edit book details' : 'Add to the collection'} description="Keep the catalog accurate for every reader." onClose={() => setModal(false)}><form className="space-y-4 p-5 sm:p-7" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="field-label">Book title<input className="input" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="field-label">Author name<input className="input" required value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} /></label>
        <label className="field-label">ISBN number<input className="input" required value={form.isbn} onChange={(event) => setForm({ ...form, isbn: event.target.value })} /></label><label className="field-label">Subject<input className="input" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
        <label className="field-label">Department<input className="input" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label><label className="field-label">Category<input className="input" required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
        <label className="field-label">Collection<input className="input" value={form.collection} onChange={(event) => setForm({ ...form, collection: event.target.value })} /></label><label className="field-label">Publisher name<input className="input" value={form.publisher} onChange={(event) => setForm({ ...form, publisher: event.target.value })} /></label>
        <label className="field-label">Edition<input className="input" value={form.edition} onChange={(event) => setForm({ ...form, edition: event.target.value })} /></label>
        <label className="field-label">Language<input className="input" value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} /></label><label className="field-label">Number of pages<input className="input" type="number" min="1" step="1" value={form.pages} onChange={(event) => setForm({ ...form, pages: event.target.value })} /></label>
      </div>
      <label className="field-label">Keywords / tags<input className="input" value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} /></label><label className="field-label">Book cover image URL or public path<input className="input" value={form.coverImage} onChange={(event) => setForm({ ...form, coverImage: event.target.value })} /></label>
      <div className="grid gap-4 border-t border-[#edf0ec] pt-4 sm:grid-cols-2"><label className="field-label">Accession number<input className="input" value={form.accessionNumber} onChange={(event) => setForm({ ...form, accessionNumber: event.target.value })} /></label><label className="field-label">Rack number<input className="input" value={form.rackNumber} onChange={(event) => setForm({ ...form, rackNumber: event.target.value })} /></label><label className="field-label">Shelf number<input className="input" value={form.shelfNumber} onChange={(event) => setForm({ ...form, shelfNumber: event.target.value })} /></label><label className="field-label">Access status<select className="select-control" value={form.accessStatus} onChange={(event) => setForm({ ...form, accessStatus: event.target.value })}><option>Open Access</option><option>Restricted</option><option>Physical Only</option></select></label><label className="field-label">Book status<select className="select-control" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>Available</option><option>Borrowed</option><option>Reserved</option><option>Unavailable</option></select></label></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Total physical copies<input className="input" type="number" min="1" step="1" required value={form.totalCopies} onChange={(event) => { const totalCopies = event.target.value; const activeCopies = editing ? database.issues.filter((issue) => issue.bookId === editing.id && issue.status === 'issued').length : 0; setForm({ ...form, totalCopies, availableCopies: Math.max(0, Number(totalCopies) - activeCopies) }) }} /></label><label className="field-label">Available copies<input className="input" type="number" min="0" step="1" readOnly value={form.availableCopies} /></label></div>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button type="submit">{editing ? 'Save changes' : 'Add book'}</Button></div>
    </form></Modal>}
  </>
}

const blankResource = { title: '', type: 'pdf', resourceType: 'pdf', author: '', subject: '', subjectCode: '', scheme: '', examYear: '', category: resourceCategories[0], department: '', semester: '', description: '', filePath: '', url: '', accessType: 'open' }
export function ManageResources() {
  const { database, refresh, notify, user } = useApp()
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [form, setForm] = useState(blankResource)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All categories')
  const [subject, setSubject] = useState('All subjects')
  const [fileType, setFileType] = useState('All file types')
  const [semester, setSemester] = useState('All semesters')
  const [year, setYear] = useState('All years')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const categories = ['All categories', ...new Set(database.resources.map((resource) => resource.category).filter(Boolean))]
  const subjects = ['All subjects', ...new Set(database.resources.map((resource) => resource.subject).filter(Boolean))]
  const types = ['All file types', ...new Set(database.resources.map((resource) => resource.type).filter(Boolean))]
  const semesters = ['All semesters', ...new Set(database.resources.map((resource) => resource.semester).filter(Boolean).sort((a, b) => Number(a) - Number(b)))]
  const years = ['All years', ...new Set(database.resources.map((resource) => resource.examYear || resource.year || resource.uploadDate?.slice(0, 4)).filter(Boolean).map(String).sort((a, b) => b.localeCompare(a)))]
  const categoryOptions = [...new Set([...resourceCategories, ...database.resources.map((resource) => resource.category).filter(Boolean), form.category].filter(Boolean))]
  const visible = database.resources.filter((resource) =>
    (!query.trim() || `${resource.title} ${resource.author} ${resource.subject} ${resource.category}`.toLowerCase().includes(query.toLowerCase().trim()))
    && (category === 'All categories' || resource.category === category)
    && (subject === 'All subjects' || resource.subject === subject)
    && (fileType === 'All file types' || resource.type === fileType)
    && (semester === 'All semesters' || resource.semester === semester)
    && (year === 'All years' || String(resource.examYear || resource.year || resource.uploadDate?.slice(0, 4) || '') === year),
  )

  function openForm(resource = null, selectedCategory = resourceCategories[0]) {
    setEditing(resource)
    const storedType = resource?.resourceType || resource?.type
    const resourceType = storedType === 'previous_paper' ? 'question_bank' : storedType || (resource?.resourceKind === 'document'
      ? ['ppt', 'pptx'].includes(resource.type) ? 'ppt' : resource.type === 'pdf' ? 'pdf' : 'study_notes'
      : resource?.type)
    setForm(resource
      ? { ...blankResource, ...resource, type: resourceType, resourceType, subjectCode: resource.subjectCode || '', scheme: resource.scheme || '', examYear: resource.examYear || '' }
      : { ...blankResource, category: selectedCategory, type: resourceTypeByCategory[selectedCategory] ?? 'pdf', resourceType: resourceTypeByCategory[selectedCategory] ?? 'pdf' })
    setSelectedFile(null)
    setUploadProgress(0)
    setError('')
    setModal(true)
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!form.title.trim() || !form.subject.trim() || !form.category.trim()) return setError('Enter a resource title, subject, and category.')
    if (form.type === 'question_bank' && (!form.subjectCode.trim() || !form.semester.trim() || !form.scheme.trim() || !String(form.examYear).trim())) {
      return setError('Enter the subject code, semester, scheme, and exam year for this question paper.')
    }
    if (form.accessType === 'restricted' && !form.department.trim()) return setError('Enter a department for restricted access.')
    const isFile = resourceFileCategories.includes(form.type)
    if (isFile && !selectedFile && !editing) return setError('Choose a file before uploading this resource.')
    if (form.type === 'question_bank' && selectedFile && !selectedFile.name.toLowerCase().endsWith('.pdf')) return setError('Question papers must be uploaded as PDF files.')
    if (form.type === 'ppt' && selectedFile && !/\.(ppt|pptx)$/i.test(selectedFile.name)) return setError('Presentations must be uploaded as PPT or PPTX files.')
    if (!isFile && !/^https?:\/\//i.test(form.url.trim())) return setError('Enter a valid http or https resource URL.')
    setUploading(true)
    try {
      if (isFile && selectedFile) {
        await api.uploadResource(selectedFile, form, setUploadProgress)
      } else if (editing?.originalName) {
        await api.updateDocumentResource(editing.id, { ...form, resourceType: form.type })
      } else if (editing && ['pdf', 'question_bank', 'previous_paper'].includes(editing.type)) {
        await api.updateResource('pdf', editing.id, { ...form, type: form.type })
      } else if (editing) {
        await api.updateResource(editing.type, editing.id, { ...form, type: form.type })
      } else {
        await api.saveResource({
          ...form,
          id: editing?.id,
          title: form.title.trim(),
          type: form.type,
          resourceType: editing?.type,
          url: form.url.trim(),
        })
      }
      await refresh()
      setModal(false)
      setSelectedFile(null)
      notify(isFile && selectedFile
        ? editing ? 'Resource file replaced successfully.' : 'Resource uploaded successfully.'
        : editing ? 'Resource details updated.' : 'Resource saved successfully.')
    } catch (issue) {
      setError(issue.message)
    } finally {
      setUploading(false)
    }
  }

  function selectFile(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    if (!acceptedResourceFiles.split(',').some((extension) => file.name.toLowerCase().endsWith(extension))) {
      setSelectedFile(null)
      setError('Choose a supported PDF, DOC, DOCX, PPT, PPTX, ODT, ODP, RTF, or TXT file.')
      event.target.value = ''
      return
    }
    if (file.size > maximumResourceSize) {
      setSelectedFile(null)
      setError('Resource files must be 35 MB or smaller.')
      event.target.value = ''
      return
    }
    setSelectedFile(file)
    setUploadProgress(0)
  }

  async function remove(resource) {
    setDeleteError('')
    setPendingDelete(resource)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      const resourceId = pendingDelete.id
      await api.deleteResource(pendingDelete.originalName ? 'document' : pendingDelete.type, resourceId)
      await refresh()
      if (editing?.id === resourceId) {
        setModal(false)
        setEditing(null)
      }
      setPendingDelete(null)
      notify('Resource deleted successfully.')
    } catch (issue) {
      setDeleteError(issue.message)
      notify(issue.message, 'error')
    } finally {
      setDeleting(false)
    }
  }

  function viewResource(resource) {
    if (resource.previewPath || ['pdf', 'question_bank', 'previous_paper'].includes(resource.type)) {
      setViewing({ ...resource, filePath: resource.previewPath || resource.filePath })
      return
    }
    if (resource.url) window.open(resource.url, '_blank', 'noopener,noreferrer')
  }

  function downloadUrl(resource) {
    const path = resource.downloadPath || resource.filePath
    if (!path) return resource.url
    const fileUrl = api.resourceFileUrl(path)
    return `${fileUrl}${fileUrl.includes('?') ? '&' : '?'}download=1`
  }

  return <>
    <PageHeader eyebrow="Study corner" title="Resources." description="Manage uploaded learning materials, documents, presentations, and shared links." action={<Button onClick={() => openForm()}><Plus size={16} /> Add resource</Button>} />
    <section className="mb-6">
      <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-forest">Organized collection</p><h2 className="mt-1 font-display text-lg font-semibold">Add to a category</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {resourceCategories.map((item, index) => {
          const count = database.resources.filter((resource) => resource.category === item).length
          return <div key={item} className="card flex items-center gap-3 p-4">
            <span className={`resource-icon ${index % 2 ? 'resource-icon-yellow' : ''}`}><FilePlus2 size={18} /></span>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{item}</p><p className="mt-1 text-[10px] text-muted">{count} {count === 1 ? 'resource' : 'resources'}</p></div>
            <Button variant="secondary" className="!min-h-8 !px-2.5 !py-1.5 !text-[10px]" onClick={() => openForm(null, item)}><Plus size={13} /> Add</Button>
          </div>
        })}
      </div>
    </section>
    <div className="notice mb-5"><FilePlus2 size={16} /><p><strong>Supported uploads</strong> include PDF, DOC/DOCX, PPT/PPTX, ODT, ODP, RTF and TXT, up to 35 MB. Office document previews require LibreOffice on the API server.</p></div>
    <div className="card overflow-hidden">
      <div className="grid gap-3 border-b border-[#edf0ec] px-4 py-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_repeat(5,minmax(125px,1fr))] sm:px-6">
        <SearchBox value={query} onChange={setQuery} placeholder="Search title, author or subject..." />
        <select className="select-control" aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select className="select-control" aria-label="Filter by subject" value={subject} onChange={(event) => setSubject(event.target.value)}>{subjects.map((item) => <option key={item}>{item}</option>)}</select>
        <select className="select-control" aria-label="Filter by file type" value={fileType} onChange={(event) => setFileType(event.target.value)}>{types.map((item) => <option key={item} value={item}>{item === 'All file types' ? item : resourceTypes[item] ?? item}</option>)}</select>
        <select className="select-control" aria-label="Filter by semester" value={semester} onChange={(event) => setSemester(event.target.value)}>{semesters.map((item) => <option key={item}>{item}</option>)}</select>
        <select className="select-control" aria-label="Filter by year" value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item}>{item}</option>)}</select>
        <span className="text-xs text-muted sm:col-span-2 lg:col-span-6">Total {database.resources.length} available resources · Showing {visible.length}</span>
      </div>
      {visible.length ? <div className="table-scroll"><table className="data-table min-w-[1050px]"><thead><tr><th>Resource</th><th>Type</th><th>Author</th><th>Subject</th><th>Category</th><th>Upload date</th><th>File size</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {visible.map((resource) => <tr key={resource.id}>
          <td><div className="font-semibold text-ink">{resource.title}</div>{resource.originalName && <div className="mt-1 text-[10px] text-muted">{resource.originalName}</div>}</td>
          <td><Badge tone={fileResourceTypes.includes(resource.type) || ['question_bank', 'previous_paper'].includes(resource.type) ? 'success' : 'blue'}>{resourceTypes[resource.type] ?? resource.type}</Badge></td>
          <td className="text-xs text-muted">{resource.author || '—'}</td><td className="text-xs text-muted">{resource.subject || '—'}</td><td className="text-xs text-muted">{resource.category || '—'}</td>
          <td className="text-xs text-muted">{prettyDate(resource.uploadDate)}</td><td className="text-xs text-muted">{resource.fileSize ? formatFileSize(resource.fileSize) : '—'}</td>
          <td><div className="flex flex-col items-start gap-1"><Badge tone="success">{resource.availability || 'Available'}</Badge>{resource.accessType === 'restricted' && <Badge>Restricted</Badge>}</div></td>
          <td><div className="flex items-center justify-end gap-1">
            {resource.filePath || resource.previewPath || resource.url ? <button type="button" className="subtle-link px-1" onClick={() => viewResource(resource)}>View</button> : <span className="px-1 text-[11px] text-muted">View</span>}
            {(resource.downloadPath || resource.filePath)
              ? <a className="subtle-link px-1" href={downloadUrl(resource)} target="_blank" rel="noreferrer">Download</a>
              : <span className="px-1 text-[11px] text-muted" title="This linked resource has no uploaded file to download.">Download</span>}
            <button type="button" className="subtle-link px-1" onClick={() => openForm(resource)}>Edit</button>
            {user?.role === 'admin' && <button type="button" className="px-1 text-[11px] font-semibold text-red-700 hover:underline" onClick={() => remove(resource)}>Delete</button>}
          </div></td>
        </tr>)}
      </tbody></table></div> : <div className="p-5"><EmptyState title={query || category !== 'All categories' || subject !== 'All subjects' || fileType !== 'All file types' ? 'No matching resources' : 'No resources yet'} description="Try another search or filter, or add a learning resource to the library." icon={Download} action={!query && <Button onClick={() => openForm()}><Plus size={15} /> Add resource</Button>} /></div>}
    </div>
    {modal && <Modal title={editing ? 'Edit resource' : 'Add resource'} description="Add learning materials to the shared library." onClose={() => setModal(false)} wide scrollable>
      <form className="resource-form-modal" onSubmit={submit}>
        <div className="resource-form-fields">
          <div className="space-y-4 p-5 sm:p-7">
        <label className="field-label">Resource title<input className="input" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field-label">Resource type<select className="select-control" value={form.type} onChange={(event) => { const type = event.target.value; setSelectedFile(null); setError(''); setForm({ ...form, type, resourceType: type, category: Object.entries(resourceTypeByCategory).find(([, categoryType]) => categoryType === type)?.[0] ?? form.category, filePath: '' }) }}>
            {(editing
              ? resourceFileCategories.includes(form.type)
                ? editing.resourceKind === 'pdf' ? resourceFileCategories.filter((type) => type !== 'ppt') : resourceFileCategories
                : ['video', 'external']
              : resourceCategoryOptions).map((type) => <option key={type} value={type}>{resourceTypes[type]}</option>)}
          </select></label>
          <label className="field-label">Author<input className="input" value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} /></label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="field-label">Subject<input className="input" required value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} /></label>
          <label className="field-label">Library category<select className="select-control" required value={form.category} onChange={(event) => { const category = event.target.value; const type = resourceTypeByCategory[category]; setSelectedFile(null); setError(''); setForm({ ...form, category, ...(type ? { type, resourceType: type, filePath: '' } : {}) }) }}><option value="" disabled>Select a category</option>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        {resourceFileCategories.includes(form.type) ? <div className="space-y-2">
          <label className="field-label">{editing ? 'Replace resource file (optional)' : `${resourceTypes[form.type]} file`}
            <input className="input !py-2" type="file" accept={form.type === 'question_bank' ? '.pdf' : form.type === 'ppt' ? '.ppt,.pptx' : acceptedResourceFiles} onChange={selectFile} disabled={uploading} />
          </label>
          <p className="text-xs text-muted" aria-live="polite">{selectedFile ? `${selectedFile.name} · ${formatFileSize(selectedFile.size)}` : (form.originalName || 'No file selected')}</p>
          {uploading && <div className="space-y-1"><div className="h-2 overflow-hidden rounded-full bg-[#edf1ec]"><div className="h-full rounded-full bg-forest transition-[width]" style={{ width: `${uploadProgress}%` }} /></div><p className="text-right text-[10px] text-muted">{uploadProgress}% uploaded</p></div>}
        </div> : <label className="field-label">{form.type === 'video' ? 'Video URL' : 'External website URL'}<input className="input" type="url" required value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://..." /></label>}
        {form.type === 'question_bank' && <div className="grid gap-4 sm:grid-cols-2">
          <label className="field-label">Subject code<input className="input" required value={form.subjectCode} onChange={(event) => setForm({ ...form, subjectCode: event.target.value })} /></label>
          <label className="field-label">Semester<input className="input" required value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })} /></label>
          <label className="field-label">Scheme<input className="input" required value={form.scheme} onChange={(event) => setForm({ ...form, scheme: event.target.value })} placeholder="e.g. 2022 scheme" /></label>
          <label className="field-label">Exam year<input className="input" type="number" required min="1900" max="2100" value={form.examYear} onChange={(event) => setForm({ ...form, examYear: event.target.value })} /></label>
        </div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {form.type !== 'question_bank' && <label className="field-label">Semester<input className="input" value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })} /></label>}
          <label className="field-label">Resource visibility<select className="select-control" value={form.accessType} onChange={(event) => setForm({ ...form, accessType: event.target.value })}><option value="open">Open to Everyone</option><option value="restricted">Department Only</option></select></label>
        </div>
        {form.accessType === 'restricted' && <label className="field-label">Department allowed to access<input className="input" required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>}
        <label className="field-label">Description<textarea className="input min-h-20 py-3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        </div>
        <div className="resource-form-actions">
          <div className="mb-2 flex justify-end gap-2">
            {editing && user?.role === 'admin' && <Button type="button" variant="secondary" className="!border-red-200 !text-red-700 hover:!bg-red-50" onClick={() => remove(editing)} disabled={uploading}><Trash2 size={15} /> Delete resource</Button>}
            <Button variant="secondary" type="button" onClick={() => setModal(false)}>Cancel</Button>
          </div>
          <Button className="w-full !min-h-11 !text-sm" type="submit" disabled={uploading}>{uploading ? <><LoaderCircle size={15} className="animate-spin" /> Saving...</> : 'Save Resource'}</Button>
        </div>
        </div>
      </form>
    </Modal>}
    {pendingDelete && <Modal title="Delete resource?" description="Are you sure you want to permanently delete this resource?" onClose={() => !deleting && setPendingDelete(null)}>
      <div className="space-y-4 p-5 sm:p-7">
        <p className="text-sm font-semibold text-ink">{pendingDelete.title}</p>
        <p className="text-xs leading-5 text-muted">This removes only this resource and its associated uploaded files.</p>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>Cancel</Button>
          <Button type="button" className="!bg-red-700 hover:!bg-red-800" onClick={confirmDelete} disabled={deleting}>{deleting ? <><LoaderCircle size={15} className="animate-spin" /> Deleting...</> : 'Confirm Delete'}</Button>
        </div>
      </div>
    </Modal>}
    {viewing && <PdfViewer resource={viewing} onClose={() => setViewing(null)} />}
  </>
}

export function IssueReturnPage() {
  const { database, refresh, notify } = useApp()
  const [form, setForm] = useState({ studentId: '', bookId: '' })
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const students = database.users.filter((user) => user.role === 'student')
  const activeIssues = database.issues.filter((issue) => issue.status === 'issued')
  const pendingRequests = database.issues.filter((issue) => issue.status === 'requested')
  const visibleIssues = [...database.issues].sort((a, b) => activityDate(b).localeCompare(activityDate(a))).filter((issue) => {
    const student = database.users.find((item) => item.id === issue.studentId)
    const book = database.books.find((item) => item.id === issue.bookId)
    return `${student?.name ?? issue.studentName ?? ''} ${student?.usn ?? issue.studentUsn ?? ''} ${book?.title ?? ''}`.toLowerCase().includes(query.toLowerCase().trim())
  })

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      await api.issueBook(form.studentId, form.bookId)
      await refresh()
      notify('Book issued. The return date is 14 days from today.')
      setForm({ studentId: '', bookId: '' })
    } catch (issue) {
      setError(issue.message)
    }
  }
  async function returnLoan(issue) {
    try {
      const returned = await api.returnBook(issue.id)
      await refresh()
      notify(returned.fine ? `Book returned. Late fine: Rs. ${returned.fine}.` : 'Book returned. No fine due.')
    } catch (issueError) {
      notify(issueError.message, 'error')
    }
  }
  async function reviewRequest(issue, action) {
    try {
      await api.reviewRequest(issue.id, action)
      await refresh()
      notify(action === 'approve' ? 'Borrow request approved.' : 'Borrow request declined.')
    } catch (issueError) {
      notify(issueError.message, 'error')
    }
  }

  return <>
    <PageHeader eyebrow="Circulation desk" title="Issue & return." description="Check out books, record returns and keep every due date clear." />
    <section className="card mb-6 p-5 sm:p-6"><div className="mb-5"><p className="font-display text-base font-semibold">Issue a book</p><p className="mt-1 text-[11px] text-muted">Books are due 14 days from the issue date.</p></div>
      <form className="grid gap-3 sm:grid-cols-[1fr_1.2fr_auto] sm:items-end" onSubmit={submit}>
        <label className="field-label">Registered student<select className="select-control w-full" required disabled={!students.length} value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })}><option value="">{students.length ? 'Select a student by name or USN' : 'No students registered yet'}</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} — {student.usn}</option>)}</select></label>
        <label className="field-label">Choose a book<select className="select-control w-full" required value={form.bookId} onChange={(event) => setForm({ ...form, bookId: event.target.value })}><option value="">Select an available book</option>{database.books.filter((book) => book.availableCopies > 0).map((book) => <option key={book.id} value={book.id}>{book.title} — {book.availableCopies} available</option>)}</select></label>
        <Button type="submit" disabled={!students.length}><ArrowUpRight size={15} /> Issue book</Button>
      </form>
      {!students.length && <p className="mt-3 text-[10px] text-muted">Students must register before you can issue books to them.</p>}{error && <p className="mt-3 form-error" role="alert">{error}</p>}
    </section>
    <section className="card overflow-hidden"><div className="flex flex-col gap-3 border-b border-[#edf0ec] px-4 py-4 sm:flex-row sm:items-center sm:px-6"><div className="flex-1"><h2 className="font-display text-base font-semibold">Issue records</h2><p className="mt-1 text-[11px] text-muted">{activeIssues.length} active loans · {pendingRequests.length} pending requests · late fine Rs. 2 per day</p></div><SearchBox value={query} onChange={setQuery} placeholder="Find student or book..." /></div>
      {visibleIssues.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Book</th><th>Issue / request date</th><th>Due date</th><th>Status / fine</th><th></th></tr></thead><tbody>{visibleIssues.map((issue) => {
        const student = database.users.find((item) => item.id === issue.studentId)
        const book = database.books.find((item) => item.id === issue.bookId)
        const overdue = issue.status === 'issued' && dayDifference(issue.dueDate) < 0
        const accruedFine = overdue ? Math.abs(dayDifference(issue.dueDate)) * 2 : issue.fine
        return <tr key={issue.id}><td><div className="font-semibold text-ink">{student?.name ?? issue.studentName ?? 'Unknown student'}</div><div className="mt-1 text-[10px] text-muted">{student?.usn ?? issue.studentUsn ?? '—'}</div></td><td className="text-xs">{book?.title ?? 'Removed book'}</td><td className="text-xs text-muted">{prettyDate(issue.status === 'requested' ? issue.requestDate || issue.issueDate : issue.issueDate)}</td><td className={`text-xs ${overdue ? 'font-semibold text-red-600' : 'text-muted'}`}>{prettyDate(issue.dueDate)}</td><td>{issue.status === 'requested' ? <Badge tone="blue">Requested</Badge> : issue.status === 'rejected' ? <Badge>Declined</Badge> : issue.status === 'returned' ? <div><Badge>Returned</Badge>{issue.fine > 0 && <p className="mt-1 text-[10px] text-red-600">Rs. {issue.fine} fine</p>}</div> : overdue ? <div><Badge tone="danger">Overdue</Badge><p className="mt-1 text-[10px] text-red-600">Rs. {accruedFine} accrued</p></div> : <Badge tone="success">Issued</Badge>}</td><td className="text-right">{issue.status === 'requested' ? <div className="flex justify-end gap-1"><Button className="!min-h-8 !px-2.5 !py-1.5 !text-[10px]" onClick={() => reviewRequest(issue, 'approve')}><Check size={13} /> Approve</Button><Button className="!min-h-8 !px-2.5 !py-1.5 !text-[10px]" variant="secondary" onClick={() => reviewRequest(issue, 'reject')}><X size={13} /> Reject</Button></div> : issue.status === 'issued' && <Button className="!min-h-8 !px-3 !py-1.5 !text-[10px]" variant="secondary" onClick={() => returnLoan(issue)}><ArrowDownLeft size={13} /> Return</Button>}</td></tr>
      })}</tbody></table></div> : <div className="p-5"><EmptyState title={query ? 'No matching records' : 'No issue records yet'} description={query ? 'Try a different USN, student or title.' : 'Books you issue to students will appear here.'} icon={BookOpen} /></div>}
    </section>
  </>
}

export function ManageStudents() {
  const { database, refresh, notify } = useApp()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [form, setForm] = useState({ name: '', usn: '', email: '', department: '', semester: '', mobile: '' })
  const [error, setError] = useState('')
  const students = database.users.filter((user) => user.role === 'student')
  const visible = students.filter((user) => `${user.name} ${user.usn} ${user.email} ${user.department}`.toLowerCase().includes(query.toLowerCase().trim()))
  function editStudent(student) {
    setEditing(student)
    setForm({ name: student.name, usn: student.usn, email: student.email, department: student.department, semester: student.semester ?? '', mobile: student.mobile ?? '' })
    setError('')
  }
  async function saveStudent(event) {
    event.preventDefault()
    try {
      await api.updateStudent(editing.id, form)
      await refresh()
      setEditing(null)
      notify('Student details updated.')
    } catch (issue) {
      setError(issue.message)
    }
  }
  async function toggleStudent(student) {
    try {
      await api.setStudentActive(student.id, !student.active)
      await refresh()
      notify(student.active ? 'Student account deactivated.' : 'Student account activated.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  async function toggleResourceEditor(student) {
    try {
      await api.setStudentResourceEditor(student.id, !student.canManageResources)
      await refresh()
      notify(student.canManageResources ? 'Resource editing permission removed.' : 'Student may now upload and edit department resources.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  async function removeStudent() {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setDeleteError('')
    try {
      await api.deleteStudent(deleteTarget.id)
      await refresh()
      setDeleteTarget(null)
      notify('Student account and personal information deleted.')
    } catch (error) {
      setDeleteError(error.message)
    } finally {
      setDeleteBusy(false)
    }
  }
  const deleteOutstanding = deleteTarget
    ? database.issues.filter((issue) => issue.studentId === deleteTarget.id && issue.status === 'issued').length
    : 0
  return <>
    <PageHeader eyebrow="Campus community" title="Your students." description="Registered members and their current library activity." />
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <StatCard label="Registered students" value={students.length} icon={Users} />
      <StatCard label="Active borrowers" value={new Set(database.issues.filter((issue) => issue.status === 'issued').map((issue) => issue.studentId)).size} icon={BookOpen} tint="lime" />
      <StatCard label="Study resources" value={database.resources.length} icon={Download} tint="blue" />
    </div>
    <section className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#edf0ec] px-4 py-4 sm:flex-row sm:items-center sm:px-6"><div className="flex-1"><h2 className="font-display text-base font-semibold">Student directory</h2><p className="mt-1 text-[11px] text-muted">Library members and borrowing history</p></div><SearchBox value={query} onChange={setQuery} placeholder="Search student or USN..." /></div>
      {visible.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>USN</th><th>Department</th><th>Contact & study</th><th>Email</th><th>Loans</th><th>Currently borrowed</th><th>Resource access</th><th>Account</th></tr></thead><tbody>
        {visible.map((student) => {
          const loans = database.issues.filter((issue) => issue.studentId === student.id)
          const current = loans.filter((issue) => issue.status === 'issued').length
          return <tr key={student.id}><td><div className="flex items-center gap-2.5"><div className="avatar avatar-soft">{student.name.slice(0, 1)}</div><span className="font-semibold text-ink">{student.name}</span></div></td><td className="text-xs text-muted">{student.usn}</td><td className="text-xs text-muted">{student.department}</td><td className="text-xs text-muted">{[student.semester && `Semester ${student.semester}`, student.mobile].filter(Boolean).join(' · ') || '—'}</td><td className="text-xs text-muted">{student.email}</td><td className="text-xs font-medium">{loans.length}</td><td>{current ? <Badge tone="success">{current} active</Badge> : <Badge tone="neutral">None</Badge>}</td><td><Button className="!min-h-8 !px-2.5 !py-1.5 !text-[10px]" variant="secondary" onClick={() => toggleResourceEditor(student)}>{student.canManageResources ? 'Can edit' : 'Grant edit'}</Button></td><td><div className="flex items-center justify-end gap-1"><ActionIcon title="Edit student details" onClick={() => editStudent(student)}><Pencil size={15} /></ActionIcon><Button className="!min-h-8 !px-2.5 !py-1.5 !text-[10px]" variant="secondary" onClick={() => toggleStudent(student)}>{student.active ? 'Deactivate' : 'Activate'}</Button><ActionIcon title="Delete student" danger onClick={() => { setDeleteTarget(student); setDeleteError('') }}><Trash2 size={15} /></ActionIcon></div></td></tr>
        })}
      </tbody></table></div> : <div className="p-5"><EmptyState title={query ? 'No matching students' : 'No students registered'} description={query ? 'Try another student name or USN.' : 'Students who register will be listed here.'} icon={Users} /></div>}
    </section>
    <p className="mt-4 flex items-center gap-2 text-[10px] text-muted"><CircleDollarSign size={13} /> Returned issues retain their recorded fines. Late returns accrue Rs. 2 per day.</p>
    {editing && <Modal title="Edit student profile" description="Update the student's contact and academic details." onClose={() => setEditing(null)}>
      <form className="space-y-4 p-5 sm:p-7" onSubmit={saveStudent}>
        <label className="field-label">Full name<input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">USN<input className="input" required value={form.usn} onChange={(event) => setForm({ ...form, usn: event.target.value })} /></label><label className="field-label">Department<input className="input" required value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label></div>
        <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Semester<input className="input" value={form.semester} onChange={(event) => setForm({ ...form, semester: event.target.value })} /></label><label className="field-label">Mobile number<input className="input" type="tel" value={form.mobile} onChange={(event) => setForm({ ...form, mobile: event.target.value })} /></label></div>
        <label className="field-label">Email<input className="input" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit">Save student</Button></div>
      </form>
    </Modal>}
    {deleteTarget && <Modal title="Delete student account" description="This action permanently removes the student's login account." onClose={() => { if (!deleteBusy) setDeleteTarget(null) }}>
      <div className="space-y-4 p-5 sm:p-7">
        <p className="text-sm font-medium text-ink">Are you sure you want to permanently delete this student account?</p>
        <p className="text-xs text-muted">{deleteTarget.name} · {deleteTarget.usn}</p>
        {deleteOutstanding > 0
          ? <p className="form-error" role="alert">Return all {deleteOutstanding} outstanding {deleteOutstanding === 1 ? 'book' : 'books'} before deleting this account.</p>
          : <p className="text-xs text-muted">Historical issue, return, and request records will be retained for audit purposes.</p>}
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button className="!bg-red-600 hover:!bg-red-700" type="button" disabled={deleteBusy || deleteOutstanding > 0} onClick={removeStudent}>{deleteBusy ? 'Deleting...' : 'Confirm Delete'}</Button></div>
      </div>
    </Modal>}
  </>
}

export function SettingsPage() {
  const { notify } = useApp()
  const [settings, setSettings] = useState({ borrowingPeriodDays: 14, borrowingLimit: 5 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getAdminSettings()
      .then(setSettings)
      .catch((issue) => setError(issue.message))
      .finally(() => setLoading(false))
  }, [])

  async function submit(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api.saveAdminSettings({ borrowingPeriodDays: Number(settings.borrowingPeriodDays), borrowingLimit: Number(settings.borrowingLimit) })
      notify('Circulation settings saved.')
    } catch (issue) {
      setError(issue.message)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <PageHeader eyebrow="Library preferences" title="Settings." description="Set the borrowing period and maximum active loans per student." />
    <form className="card max-w-xl space-y-5 p-5 sm:p-7" onSubmit={submit}>
      <label className="field-label">Borrowing period in days<input className="input" type="number" min="1" max="90" required value={settings.borrowingPeriodDays} onChange={(event) => setSettings({ ...settings, borrowingPeriodDays: event.target.value })} /></label>
      <label className="field-label">Maximum active books per student<input className="input" type="number" min="1" max="20" required value={settings.borrowingLimit} onChange={(event) => setSettings({ ...settings, borrowingLimit: event.target.value })} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit" disabled={loading || saving}>{saving ? 'Saving...' : 'Save settings'}</Button>
    </form>
  </>
}

export function ReportsPage() {
  const { database } = useApp()
  const active = database.issues.filter((issue) => issue.status === 'issued')
  const overdue = active.filter((issue) => dayDifference(issue.dueDate) < 0)
  const availableCopies = database.books.reduce((sum, book) => sum + Number(book.availableCopies || 0), 0)

  function exportCirculation() {
    const header = ['Student', 'USN', 'Book', 'Issue date', 'Due date', 'Return date', 'Status', 'Fine']
    const rows = database.issues.map((issue) => {
      const student = database.users.find((item) => item.id === issue.studentId)
      const book = database.books.find((item) => item.id === issue.bookId)
      return [student?.name ?? issue.studentName, student?.usn ?? issue.studentUsn, book?.title, issue.issueDate, issue.dueDate, issue.returnDate, issue.status, issue.fine]
    })
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'libraai-circulation-report.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return <>
    <PageHeader eyebrow="Collection reporting" title="Reports." description="Current circulation, overdue loans, and collection availability." action={<Button variant="secondary" onClick={exportCirculation}><Download size={15} /> Export circulation CSV</Button>} />
    <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Borrowing records" value={database.issues.length} icon={BookOpen} />
      <StatCard label="Currently borrowed" value={active.length} icon={ArrowUpRight} tint="lime" />
      <StatCard label="Overdue" value={overdue.length} icon={AlertTriangle} tint={overdue.length ? 'rose' : 'blue'} />
      <StatCard label="Available copies" value={availableCopies} icon={LibraryBig} tint="blue" />
    </div>
    <section className="card overflow-hidden"><div className="border-b border-[#edf0ec] px-5 py-5"><h2 className="font-display text-base font-semibold">Overdue loans</h2><p className="mt-1 text-[11px] text-muted">Records that need a return reminder</p></div>
      {overdue.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Book</th><th>Due date</th><th>Days overdue</th></tr></thead><tbody>{overdue.map((issue) => <tr key={issue.id}><td>{database.users.find((item) => item.id === issue.studentId)?.name ?? issue.studentName ?? 'Unknown student'}</td><td>{database.books.find((item) => item.id === issue.bookId)?.title ?? 'Removed book'}</td><td>{prettyDate(issue.dueDate)}</td><td className="font-semibold text-red-600">{Math.abs(dayDifference(issue.dueDate))}</td></tr>)}</tbody></table></div> : <div className="p-5"><EmptyState title="No overdue loans" description="All current loans are within their due dates." icon={BookOpen} /></div>}
    </section>
  </>
}

export function NotificationsPage() {
  const { database, refresh, notify } = useApp()
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState('')
  const unread = database.notifications.filter((item) => !item.readAt).length
  async function sendAnnouncement(event) {
    event.preventDefault()
    setError('')
    try {
      const result = await api.publishAnnouncement(announcement)
      setAnnouncement('')
      await refresh()
      notify(`Announcement sent to ${result.recipients} students.`)
    } catch (issue) {
      setError(issue.message)
    }
  }
  async function markRead() {
    try {
      await api.markNotificationsRead()
      await refresh()
      notify('Notifications marked as read.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  async function reviewBookRequest(issue, action) {
    try {
      await api.reviewRequest(issue.id, action)
      await refresh()
      notify(action === 'approve' ? 'Borrow request approved.' : 'Borrow request declined.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  return <>
    <PageHeader eyebrow="Library activity" title="Notifications." description={`${unread} unread updates for your library desk.`} action={unread > 0 && <Button variant="secondary" onClick={markRead}><Check size={15} /> Mark all read</Button>} />
    <form className="card mb-5 space-y-3 p-5" onSubmit={sendAnnouncement}>
      <label className="field-label">Send an announcement to active students<textarea className="input min-h-20 py-3" maxLength="1000" required value={announcement} onChange={(event) => setAnnouncement(event.target.value)} placeholder="Library hours, service updates, or important notices" /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="submit">Send announcement</Button></div>
    </form>
    {database.notifications.length ? <section className="card divide-y divide-[#edf0ec]">{database.notifications.map((item) => {
      const request = item.type === 'book_request' ? database.issues.find((issue) => issue.id === item.relatedId) : null
      const student = request && database.users.find((user) => user.id === request.studentId)
      const book = request && database.books.find((entry) => entry.id === request.bookId)
      const requestStatus = request?.status === 'requested' ? 'Pending' : request?.status === 'issued' ? 'Approved' : request?.status === 'rejected' ? 'Rejected' : request?.status
      return <div key={item.id} className="flex items-start gap-3 p-5">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.readAt ? 'bg-[#d5ddd7]' : 'bg-forest'}`} />
        <div className="min-w-0 flex-1">
          {request ? <>
            <p className="text-xs font-semibold">{item.message}</p>
            <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
              <div><dt className="text-muted">Student</dt><dd className="mt-0.5 font-medium">{student?.name ?? request.studentName ?? 'Deleted student'}</dd></div>
              <div><dt className="text-muted">USN</dt><dd className="mt-0.5 font-medium">{student?.usn ?? request.studentUsn ?? '—'}</dd></div>
              <div><dt className="text-muted">Book</dt><dd className="mt-0.5 font-medium">{book?.title ?? 'Removed book'}</dd></div>
              <div><dt className="text-muted">Request date / status</dt><dd className="mt-0.5 flex items-center gap-2 font-medium">{prettyDate(request.requestDate || request.issueDate)}<Badge tone={request.status === 'requested' ? 'blue' : request.status === 'issued' ? 'success' : 'neutral'}>{requestStatus}</Badge></dd></div>
            </dl>
            {request.status === 'requested' && <div className="mt-4 flex gap-2"><Button className="!min-h-8 !px-2.5 !py-1.5 !text-[10px]" onClick={() => reviewBookRequest(request, 'approve')}><Check size={13} /> Approve</Button><Button className="!min-h-8 !px-2.5 !py-1.5 !text-[10px]" variant="secondary" onClick={() => reviewBookRequest(request, 'reject')}><X size={13} /> Reject</Button></div>}
          </> : <p className="text-xs font-medium">{item.message}</p>}
          <p className="mt-2 text-[10px] text-muted">{prettyDate(item.createdAt?.slice(0, 10))}</p>
        </div>
      </div>
    })}</section> : <EmptyState title="No notifications yet" description="Borrow requests and library activity will appear here." icon={BookOpen} />}
  </>
}

export function CategoriesSubjectsPage() {
  const { database, refresh, notify } = useApp()
  const [values, setValues] = useState({ category: '', subject: '' })
  const [error, setError] = useState('')

  async function add(kind, event) {
    event.preventDefault()
    const name = values[kind].trim()
    if (!name) return
    setError('')
    try {
      await api.saveCatalogValue(kind, name)
      await refresh()
      setValues({ ...values, [kind]: '' })
      notify(`${kind === 'category' ? 'Category' : 'Subject'} saved.`)
    } catch (issue) {
      setError(issue.message)
    }
  }

  async function remove(item) {
    try {
      await api.deleteCatalogValue(item.id)
      await refresh()
      notify('Catalog entry removed.')
    } catch (issue) {
      notify(issue.message, 'error')
    }
  }

  function catalogSection(kind, items, title) {
    return <section className="card overflow-hidden">
      <form className="flex flex-col gap-3 border-b border-[#edf0ec] p-5 sm:flex-row sm:items-end" onSubmit={(event) => add(kind, event)}>
        <label className="field-label flex-1">{title}<input className="input" value={values[kind]} onChange={(event) => setValues({ ...values, [kind]: event.target.value })} placeholder={`Add ${kind}`} /></label>
        <Button type="submit"><Plus size={15} /> Add</Button>
      </form>
      <div className="divide-y divide-[#edf0ec]">{items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3"><span className="text-xs font-medium">{item.name}</span><ActionIcon title={`Delete ${kind}`} danger onClick={() => remove(item)}><Trash2 size={15} /></ActionIcon></div>)}</div>
      {!items.length && <p className="p-5 text-xs text-muted">No {kind}s yet.</p>}
    </section>
  }

  return <>
    <PageHeader eyebrow="Catalog structure" title="Categories & subjects." description="Organize books for browsing and reporting." />
    {error && <p className="form-error mb-4" role="alert">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-2">{catalogSection('category', database.categories, 'Category name')}{catalogSection('subject', database.subjects, 'Subject name')}</div>
  </>
}

export function ManageLibrariansPage() {
  const { database, refresh, notify, user } = useApp()
  const [values, setValues] = useState({ name: '', usn: '', email: '', password: '' })
  const [error, setError] = useState('')
  const librarians = database.users.filter((item) => item.role === 'admin')

  async function submit(event) {
    event.preventDefault()
    setError('')
    try {
      await api.createLibrarian(values)
      await refresh()
      setValues({ name: '', usn: '', email: '', password: '' })
      notify('Librarian account created.')
    } catch (issue) {
      setError(issue.message)
    }
  }
  async function toggleLibrarian(librarian) {
    try {
      await api.setLibrarianActive(librarian.id, !librarian.active)
      await refresh()
      notify(librarian.active ? 'Librarian account deactivated.' : 'Librarian account activated.')
    } catch (issue) {
      notify(issue.message, 'error')
    }
  }

  return <>
    <PageHeader eyebrow="Library team" title="Manage librarians." description="Create additional staff accounts for the library desk." />
    <section className="card mb-6 overflow-hidden"><div className="border-b border-[#edf0ec] px-5 py-4"><h2 className="font-display text-base font-semibold">Librarian accounts</h2></div><div className="divide-y divide-[#edf0ec]">{librarians.map((librarian) => <div key={librarian.id} className="flex items-center gap-3 px-5 py-4"><div className="avatar avatar-soft">{librarian.name.slice(0, 1)}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{librarian.name}</p><p className="mt-1 truncate text-[10px] text-muted">{librarian.usn} · {librarian.email}</p></div><Badge tone={librarian.active ? 'success' : 'neutral'}>{librarian.active ? 'Active' : 'Inactive'}</Badge><Button className="!min-h-8 !px-2.5 !py-1.5 !text-[10px]" variant="secondary" disabled={user.id === librarian.id} onClick={() => toggleLibrarian(librarian)}>{librarian.active ? 'Deactivate' : 'Activate'}</Button></div>)}</div></section>
    <form className="card max-w-xl space-y-4 p-5 sm:p-7" onSubmit={submit}>
      <h2 className="font-display text-base font-semibold">Add librarian</h2>
      <label className="field-label">Full name<input className="input" required value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Librarian ID<input className="input" required value={values.usn} onChange={(event) => setValues({ ...values, usn: event.target.value })} /></label><label className="field-label">Email<input className="input" type="email" required value={values.email} onChange={(event) => setValues({ ...values, email: event.target.value })} /></label></div>
      <label className="field-label">Temporary password<input className="input" type="password" required minLength="8" value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit">Create librarian account</Button>
    </form>
  </>
}
