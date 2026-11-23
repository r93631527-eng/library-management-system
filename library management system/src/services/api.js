const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')
const apiUrl = (path) => `${apiBase}/api${path}`

async function fetchApi(url, options) {
  try {
    return await fetch(url, options)
  } catch (error) {
    if (error instanceof TypeError) {
      const target = apiBase || 'the same-origin /api proxy'
      throw new Error(`Cannot reach the LibraAI API at ${target}. Check that the API server is running and that its origin is allowed by the server CORS configuration.`)
    }
    throw error
  }
}

export const resourceFileUrl = (filePath) => {
  if (!filePath?.startsWith('/api/')) return filePath
  return new URL(`${apiBase.replace(/\/$/, '')}${filePath}`, window.location.href).toString()
}

async function request(path, options = {}) {
  const response = await fetchApi(apiUrl(path), {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const result = response.status === 204 ? {} : await response.json()
  if (!response.ok) {
    const error = new Error(result.error ?? 'The library server could not complete this request.')
    error.status = response.status
    throw error
  }
  return result
}

const send = (method, body) => ({ method, body: JSON.stringify(body) })

export const getDatabase = () => request('/database')
export const getSession = async () => (await request('/auth/session')).user
export const signIn = (identifier, password, role) => request('/auth/login', send('POST', { identifier, password, role }))
export const registerUser = (details) => request('/auth/register', send('POST', details))
export const setupAdmin = (details) => request('/auth/setup', send('POST', details))
export const signOut = () => request('/auth/logout', send('POST', {}))
export const createLibrarianRecoveryCode = async () => (await request('/admin/recovery-code', send('POST', {}))).code
export const resetLibrarianPassword = (identifier, recoveryCode, password) => request('/auth/recovery', send('POST', { identifier, recoveryCode, password }))
export const saveBook = (book) => request('/books', send('POST', book))
export const deleteBook = (bookId) => request(`/books/${encodeURIComponent(bookId)}`, { method: 'DELETE' })
export const issueBook = (studentId, bookId) => request('/issues', send('POST', { studentId, bookId }))
export const requestBook = (bookId) => request('/requests', send('POST', { bookId }))
export const reviewRequest = (requestId, action) => request(`/requests/${encodeURIComponent(requestId)}`, { ...send('PATCH', { action }) })
export const returnBook = (issueId) => request(`/issues/${encodeURIComponent(issueId)}/return`, send('POST', {}))
export const saveResource = (resource) => request('/resources', send('POST', resource))
export const updateResource = (resourceType, resourceId, details) => request(`/resources/${encodeURIComponent(resourceType)}/${encodeURIComponent(resourceId)}`, send('PATCH', details))
export const updateDocumentResource = (resourceId, details) => request(`/resources/document/${encodeURIComponent(resourceId)}`, send('PATCH', details))
export function uploadResource(file, resource, onProgress = () => {}) {
  const maximumSize = 35 * 1024 * 1024
  if (file.size > maximumSize) return Promise.reject(new Error('Resource files must be 35 MB or smaller.'))
  const form = new FormData()
  form.append('file', file)
  const uploadKey = resource.id
    ? `resource:${resource.id}:${file.name}:${file.size}:${file.lastModified}`
    : `upload:${file.name}:${file.size}:${file.lastModified}`
  form.append('uploadKey', uploadKey)
  for (const field of ['id', 'title', 'author', 'subject', 'subjectCode', 'scheme', 'examYear', 'resourceType', 'category', 'accessType', 'department', 'semester', 'description']) {
    if (resource[field] !== undefined && resource[field] !== '') form.append(field, String(resource[field]))
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${apiBase}/api/uploads/resource`)
    xhr.withCredentials = true
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    xhr.addEventListener('load', () => {
      let result
      try {
        result = JSON.parse(xhr.responseText)
      } catch {
        reject(new Error('The library server returned an invalid upload response.'))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(result.error ?? 'The resource could not be uploaded.'))
        return
      }
      onProgress(100)
      resolve(result)
    })
    xhr.addEventListener('error', () => reject(new Error('The resource upload could not reach the library server.')))
    xhr.addEventListener('abort', () => reject(new Error('The resource upload was cancelled.')))
    xhr.send(form)
  })
}
export function uploadPdf(file, resource, onProgress = () => {}) {
  const maximumSize = 35 * 1024 * 1024
  if (file.size > maximumSize) return Promise.reject(new Error('PDF files must be 35 MB or smaller.'))
  const form = new FormData()
  form.append('file', file)
  for (const field of ['id', 'type', 'resourceType', 'title', 'author', 'subject', 'subjectCode', 'scheme', 'examYear', 'category', 'accessType', 'department', 'semester']) {
    if (resource[field] !== undefined && resource[field] !== '') form.append(field, String(resource[field]))
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${apiBase}/api/uploads/pdf`)
    xhr.withCredentials = true
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    })
    xhr.addEventListener('load', () => {
      let result
      try {
        result = JSON.parse(xhr.responseText)
      } catch {
        reject(new Error('The library server returned an invalid upload response.'))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(result.error ?? 'The PDF could not be uploaded.'))
        return
      }
      onProgress(100)
      resolve(result)
    })
    xhr.addEventListener('error', () => reject(new Error('The PDF upload could not reach the library server.')))
    xhr.addEventListener('abort', () => reject(new Error('The PDF upload was cancelled.')))
    xhr.send(form)
  })
}
export const deleteResource = (resourceType, resourceId) => {
  const type = ['question_bank', 'previous_paper'].includes(resourceType) ? 'pdf' : resourceType
  return request(`/resources/${encodeURIComponent(type)}/${encodeURIComponent(resourceId)}`, { method: 'DELETE' })
}
export const setStudentActive = (studentId, active) => request(`/admin/students/${encodeURIComponent(studentId)}`, send('PATCH', { active }))
export const setStudentResourceEditor = (studentId, resourceEditor) => request(`/admin/students/${encodeURIComponent(studentId)}`, send('PATCH', { resourceEditor }))
export const updateStudent = (studentId, details) => request(`/admin/students/${encodeURIComponent(studentId)}`, send('PATCH', details))
export const deleteStudent = (studentId) => request(`/admin/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' })
export const getAdminSettings = () => request('/admin/settings')
export const saveAdminSettings = (settings) => request('/admin/settings', send('PUT', settings))
export const createLibrarian = (details) => request('/admin/librarians', send('POST', details))
export const setLibrarianActive = (librarianId, active) => request(`/admin/librarians/${encodeURIComponent(librarianId)}`, send('PATCH', { active }))
export const saveCatalogValue = (kind, name) => request('/categories', send('POST', { kind, name }))
export const deleteCatalogValue = (id) => request(`/categories/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const setFavourite = (bookId, saved) => request(`/favourites/${encodeURIComponent(bookId)}`, { method: saved ? 'POST' : 'DELETE' })
export const setResourceFavourite = (resourceKind, resourceId, saved) => request('/resource-favourites', {
  ...send('POST', { resourceKind, resourceId }),
  method: saved ? 'POST' : 'DELETE',
})
export const recordResourceActivity = (resourceKind, resourceId, pageNumber = 1, totalPages = null) => request('/resources/activity', send('POST', { resourceKind, resourceId, pageNumber, totalPages }))
export const summarizeResource = (resourceKind, resourceId) => request(`/resources/${encodeURIComponent(resourceKind)}/${encodeURIComponent(resourceId)}/summary`, send('POST', {}))
export async function summarizeUploadedPdf(file) {
  const maximumSize = 35 * 1024 * 1024
  if (file.size > maximumSize) throw new Error('PDF files must be 35 MB or smaller.')
  const form = new FormData()
  form.append('file', file)
  const response = await fetchApi(apiUrl('/ai/summarize-upload'), {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  let result
  try {
    result = await response.json()
  } catch {
    throw new Error('The library server returned an invalid summary response.')
  }
  if (!response.ok) throw new Error(result.error ?? 'The PDF could not be summarized.')
  return result
}
export const reportResourceIssue = (resourceKind, resourceId, details) => request(`/resources/${encodeURIComponent(resourceKind)}/${encodeURIComponent(resourceId)}/report`, send('POST', { details }))
export const markNotificationsRead = () => request('/notifications/read', send('POST', {}))
export const publishAnnouncement = (message) => request('/admin/announcements', send('POST', { message }))
export const resetLibraryData = () => request('/admin/reset-samples', send('POST', {}))
