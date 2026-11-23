import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, BookOpen, Bookmark, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Copy, Download, Flag, LibraryBig, LoaderCircle, Maximize2, Minimize2, Search, Sparkles, X, ZoomIn, ZoomOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Button, EmptyState, Modal, PageHeader, SearchBox, StatCard } from '../components/Layout'
import { useApp } from '../context/useApp'
import { resourceCategories } from '../resourceCategories'
import * as api from '../services/api'

const dateLabel = (value) => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const activityDate = (issue) => issue.returnDate || issue.issueDate || ''
const dayDifference = (date) => {
  const today = new Date().toISOString().slice(0, 10)
  return Math.ceil((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
}
const resourceTypes = {
  question_bank: 'Question papers', previous_paper: 'Previous paper', pdf: 'E-books / PDFs',
  study_notes: 'Study notes', lab_manual: 'Lab manuals',
  doc: 'Word document', docx: 'Word document', ppt: 'PPT / presentations', pptx: 'PPT / presentations',
  odt: 'OpenDocument text', odp: 'OpenDocument presentation', rtf: 'Rich text', txt: 'Text file',
  video: 'Video lectures', external: 'External website',
}

function expandNarrowCropBoxes(pdfData) {
  const source = new TextDecoder('latin1').decode(pdfData)
  const number = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)'
  const boxPattern = new RegExp(`/MediaBox\\s*\\[\\s*(${number})\\s+(${number})\\s+(${number})\\s+(${number})\\s*\\]`, 'g')
  const mediaBoxes = new Map()
  for (const match of source.matchAll(boxPattern)) {
    const box = match.slice(1).map(Number)
    if (box.every(Number.isFinite) && box[2] > box[0] && box[3] > box[1]) {
      mediaBoxes.set(box.join(','), { box, source: match[0].slice(match[0].indexOf('[') + 1, match[0].lastIndexOf(']')).trim() })
    }
  }
  if (mediaBoxes.size !== 1) return pdfData
  const { box: mediaBox, source: mediaBoxSource } = mediaBoxes.values().next().value
  const mediaArea = (mediaBox[2] - mediaBox[0]) * (mediaBox[3] - mediaBox[1])
  let expandedData
  const cropPattern = new RegExp(`/CropBox\\s*\\[([^\\]]+)\\]`, 'g')
  let changed = false
  for (const match of source.matchAll(cropPattern)) {
    const cropBox = match[1].trim().split(/\s+/).map(Number)
    if (cropBox.length !== 4 || !cropBox.every(Number.isFinite)) continue
    const cropArea = (cropBox[2] - cropBox[0]) * (cropBox[3] - cropBox[1])
    if (cropArea >= mediaArea * 0.9 || match[1].length !== mediaBoxSource.length) continue
    if (!expandedData) expandedData = pdfData.slice()
    const contentOffset = match.index + match[0].indexOf('[') + 1
    for (let index = 0; index < mediaBoxSource.length; index += 1) {
      expandedData[contentOffset + index] = mediaBoxSource.charCodeAt(index)
    }
    changed = true
  }
  return changed ? expandedData : pdfData
}

function getPdfPageScale(dimensions, viewerSize, fitMode, zoom) {
  const availableWidth = Math.max(1, viewerSize.width - 32)
  const widthScale = availableWidth / dimensions.width
  const heightScale = Math.max(1, viewerSize.height - 44) / dimensions.height
  const fitScale = fitMode === 'page'
    ? Math.min(widthScale, heightScale)
    : fitMode === 'actual'
      ? 1
      : widthScale
  return fitScale * zoom
}

function SummaryContent({ text }) {
  return text.split('\n').map((line, index) => {
    const content = line.trim()
    if (!content) return <div key={index} className="h-2" />
    const heading = content.match(/^#{1,3}\s+(.+)$/)
    if (heading) return <h3 key={index} className="mt-4 font-display text-sm font-semibold text-ink first:mt-0">{heading[1]}</h3>
    const bullet = content.match(/^(?:[-*]|\d+\.)\s+(.+)$/)
    if (bullet) return <p key={index} className="flex gap-2 text-xs leading-5 text-muted"><span className="text-forest">•</span><span>{bullet[1]}</span></p>
    return <p key={index} className="text-xs leading-5 text-muted">{content}</p>
  })
}

export function PdfViewer({ resource, onClose, onPageChange }) {
  const pdfFilePath = resource.previewPath || resource.filePath
  return <PdfViewerDocument key={`${resource.id}:${pdfFilePath}`} resource={resource} pdfFilePath={pdfFilePath} onClose={onClose} onPageChange={onPageChange} />
}

function PdfViewerDocument({ resource, pdfFilePath, onClose, onPageChange }) {
  const [document, setDocument] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageInput, setPageInput] = useState('1')
  const [pageRange, setPageRange] = useState([1, 2])
  const [pageDimensions, setPageDimensions] = useState({})
  const [fitMode, setFitMode] = useState('page')
  const [zoom, setZoom] = useState(1)
  const [viewerSize, setViewerSize] = useState({ width: 0, height: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')
  const [summaryError, setSummaryError] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryCopied, setSummaryCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const viewerRef = useRef(null)
  const overlayRef = useRef(null)
  const renderTaskRef = useRef(null)
  const canSummarize = resource.resourceKind === 'pdf'
    || (resource.resourceKind === 'document' && resource.fileType === 'pdf')

  useEffect(() => {
    let active = true
    let loadingTask
    let loadedDocument
    let createPdfDocument
    import('pdfjs-dist').then(({ getDocument, GlobalWorkerOptions }) => {
      if (!active) return null
      GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      createPdfDocument = getDocument
      loadingTask = getDocument({
        url: api.resourceFileUrl(pdfFilePath),
        withCredentials: true,
      })
      return loadingTask.promise
    }).then(async (pdfDocument) => {
      if (!pdfDocument) return
      loadedDocument = pdfDocument
      if (!active) {
        await pdfDocument.destroy()
        return
      }
      const originalData = await pdfDocument.getData()
      const expandedData = expandNarrowCropBoxes(originalData)
      if (expandedData !== originalData) {
        await pdfDocument.destroy()
        if (!active) return
        loadingTask = createPdfDocument({ data: expandedData })
        pdfDocument = await loadingTask.promise
        loadedDocument = pdfDocument
      }
      const dimensions = {}
      const pageBatchSize = 16
      for (let firstPage = 1; firstPage <= pdfDocument.numPages; firstPage += pageBatchSize) {
        const lastPage = Math.min(pdfDocument.numPages, firstPage + pageBatchSize - 1)
        const pages = await Promise.all(Array.from(
          { length: lastPage - firstPage + 1 },
          async (_, index) => {
            const pageNumber = firstPage + index
            const page = await pdfDocument.getPage(pageNumber)
            const viewport = page.getViewport({ scale: 1, rotation: page.rotate })
            return [pageNumber, { width: viewport.width, height: viewport.height, rotation: page.rotate }]
          },
        ))
        if (!active) {
          await pdfDocument.destroy()
          return
        }
        Object.assign(dimensions, Object.fromEntries(pages))
      }
      setPageDimensions(dimensions)
      setDocument(pdfDocument)
      setPageCount(pdfDocument.numPages)
      setLoading(false)
    }).catch((loadError) => {
      if (loadedDocument) loadedDocument.destroy()
      if (active) {
        setError(loadError.message || 'This PDF could not be opened.')
        setLoading(false)
      }
    })
    return () => {
      active = false
      loadingTask?.destroy()
    }
  }, [pdfFilePath])

  useEffect(() => {
    function syncFullscreen() {
      setIsFullscreen(window.document.fullscreenElement === overlayRef.current)
    }
    window.document.addEventListener('fullscreenchange', syncFullscreen)
    return () => window.document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return undefined
    const observer = new ResizeObserver(([entry]) => {
      const { width: nextWidth, height: nextHeight } = entry.contentRect
      setViewerSize((previous) => previous.width === nextWidth && previous.height === nextHeight
        ? previous
        : { width: nextWidth, height: nextHeight })
    })
    observer.observe(viewer)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!document || !pageCount || !viewerSize.width || !viewerSize.height) return undefined
    let active = true
    let activeRenderTask = null
    const [firstPage, lastPage] = pageRange
    const canvases = [...viewerRef.current.querySelectorAll('canvas[data-page]')]
    for (const canvas of canvases) {
      const pageNumber = Number(canvas.dataset.page)
      if (pageNumber < firstPage || pageNumber > lastPage) {
        canvas.width = 0
        canvas.height = 0
        canvas.style.width = ''
        canvas.style.height = ''
      }
    }
    const renderPages = async () => {
      try {
        for (const canvas of canvases.filter((item) => Number(item.dataset.page) >= firstPage && Number(item.dataset.page) <= lastPage)) {
          if (!active) return
          const pageNumber = Number(canvas.dataset.page)
          const page = await document.getPage(pageNumber)
          const dimensions = pageDimensions[pageNumber]
          if (!dimensions) throw new Error(`Page ${pageNumber} dimensions are unavailable.`)
          const scale = getPdfPageScale(dimensions, viewerSize, fitMode, zoom)
          const viewport = page.getViewport({ scale, rotation: dimensions.rotation })
          const outputScale = Math.min(window.devicePixelRatio || 1, 2)
          canvas.width = Math.ceil(viewport.width * outputScale)
          canvas.height = Math.ceil(viewport.height * outputScale)
          canvas.style.width = `${viewport.width}px`
          canvas.style.height = `${viewport.height}px`
          const context = canvas.getContext('2d')
          activeRenderTask = page.render({
            canvasContext: context,
            viewport,
            transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
          })
          renderTaskRef.current = activeRenderTask
          await activeRenderTask.promise
        }
      } catch (renderError) {
        if (active && renderError.name !== 'RenderingCancelledException') setError(renderError.message || 'A PDF page could not be rendered.')
      } finally {
        if (renderTaskRef.current === activeRenderTask) renderTaskRef.current = null
      }
    }
    renderPages()
    return () => {
      active = false
      activeRenderTask?.cancel()
    }
  }, [document, pageCount, pageRange, pageDimensions, viewerSize, fitMode, zoom])

  useEffect(() => {
    if (document && pageCount) onPageChange?.(currentPage, pageCount)
  }, [currentPage, document, onPageChange, pageCount])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function navigateToPage(pageNumber) {
    const page = Math.max(1, Math.min(pageCount, Number(pageNumber) || 1))
    setCurrentPage(page)
    setPageInput(String(page))
    const viewer = viewerRef.current
    const pageElement = viewer?.querySelector(`.pdf-viewer-page[data-page="${page}"]`)
    if (viewer && pageElement) {
      const offset = pageElement.getBoundingClientRect().top - viewer.getBoundingClientRect().top
      viewer.scrollTo({ top: viewer.scrollTop + offset, behavior: 'auto' })
    }
  }

  function applyFitMode(mode) {
    setFitMode(mode)
    setZoom(1)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      navigateToPage(currentPage)
      const viewer = viewerRef.current
      const pageElement = viewer?.querySelector(`.pdf-viewer-page[data-page="${currentPage}"]`)
      const viewerBounds = viewer?.getBoundingClientRect()
      const pageBounds = pageElement?.getBoundingClientRect()
      if (viewer && viewerBounds && pageBounds) {
        viewer.scrollLeft += pageBounds.left - viewerBounds.left + pageBounds.width / 2 - viewer.clientWidth / 2
      }
    }))
  }

  function changeZoom(nextZoom) {
    const viewer = viewerRef.current
    const pageElement = viewer?.querySelector(`.pdf-viewer-page[data-page="${currentPage}"]`)
    const viewerBounds = viewer?.getBoundingClientRect()
    const pageBounds = pageElement?.getBoundingClientRect()
    const ratio = nextZoom / zoom
    const centerX = viewer ? viewer.scrollLeft + viewer.clientWidth / 2 : 0
    const centerY = viewer ? viewer.scrollTop + viewer.clientHeight / 2 : 0
    const pageLeft = viewer && viewerBounds && pageBounds
      ? pageBounds.left - viewerBounds.left + viewer.scrollLeft
      : 0
    const pageTop = viewer && viewerBounds && pageBounds
      ? pageBounds.top - viewerBounds.top + viewer.scrollTop
      : 0
    const pageCenterX = centerX - pageLeft
    const pageCenterY = centerY - pageTop
    setZoom(nextZoom)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!viewer || !pageElement || !viewerBounds) return
      const resizedBounds = pageElement.getBoundingClientRect()
      const resizedPageLeft = resizedBounds.left - viewerBounds.left + viewer.scrollLeft
      const resizedPageTop = resizedBounds.top - viewerBounds.top + viewer.scrollTop
      viewer.scrollLeft = resizedPageLeft + pageCenterX * ratio - viewer.clientWidth / 2
      viewer.scrollTop = resizedPageTop + pageCenterY * ratio - viewer.clientHeight / 2
    }))
  }

  function updateCurrentPage() {
    const viewer = viewerRef.current
    if (!viewer || !pageCount) return
    const pages = [...viewer.querySelectorAll('.pdf-viewer-page')]
    const viewerBounds = viewer.getBoundingClientRect()
    const visiblePages = pages.map((page) => {
      const bounds = page.getBoundingClientRect()
      const visibleHeight = Math.max(0, Math.min(bounds.bottom, viewerBounds.bottom) - Math.max(bounds.top, viewerBounds.top))
      return { page, visibleHeight }
    }).filter(({ visibleHeight }) => visibleHeight > 0)
    if (!visiblePages.length) return
    const firstVisible = Number(visiblePages[0]?.page.dataset.page) || 1
    const lastVisible = Number(visiblePages[visiblePages.length - 1]?.page.dataset.page) || firstVisible
    const mostVisible = Number(visiblePages.reduce((largest, page) => page.visibleHeight > largest.visibleHeight ? page : largest, visiblePages[0])?.page.dataset.page) || 1
    if (mostVisible !== currentPage) {
      setCurrentPage(mostVisible)
      setPageInput(String(mostVisible))
    }
    const nextRange = [Math.max(1, firstVisible - 1), Math.min(pageCount, lastVisible + 1)]
    if (nextRange[0] !== pageRange[0] || nextRange[1] !== pageRange[1]) setPageRange(nextRange)
  }

  async function toggleFullscreen() {
    try {
      if (window.document.fullscreenElement === overlayRef.current) {
        await window.document.exitFullscreen()
      } else {
        await overlayRef.current?.requestFullscreen()
      }
    } catch (fullscreenError) {
      setError(fullscreenError.message || 'Fullscreen mode could not be opened.')
    }
  }

  async function generateSummary() {
    if (!canSummarize || summaryLoading) return
    setSummaryOpen(true)
    setSummaryError('')
    setSummaryLoading(true)
    setSummaryCopied(false)
    try {
      const result = await api.summarizeResource(resource.resourceKind || resource.type, resource.id)
      setSummary(result.summary)
    } catch (summaryRequestError) {
      setSummaryError(summaryRequestError.message || 'The PDF could not be summarized. Please try again.')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary)
      setSummaryCopied(true)
      setSummaryError('')
    } catch {
      setSummaryError('Clipboard access is unavailable. Select and copy the summary text instead.')
    }
  }

  function downloadSummary() {
    const blob = new Blob([summary], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${String(resource.title || 'PDF').replace(/[<>:"/\\|?*]/g, '_').split('').map((character) => character.charCodeAt(0) < 32 ? '_' : character).join('')}-summary.md`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className="pdf-viewer-overlay" ref={overlayRef} role="dialog" aria-modal="true" aria-label={`PDF viewer: ${resource.title}`}>
    <header className="pdf-viewer-toolbar">
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{resource.title}</p><p className="truncate text-[10px] text-muted">{resource.author || 'PDF document'}</p></div>
      <div className="pdf-viewer-controls">
        <button type="button" className="icon-button" aria-label="Zoom out" disabled={zoom <= 0.5} onClick={() => changeZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut size={17} /></button>
        <span className="min-w-10 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
        <button type="button" className="icon-button" aria-label="Zoom in" disabled={zoom >= 2.5} onClick={() => changeZoom(Math.min(2.5, zoom + 0.25))}><ZoomIn size={17} /></button>
        <span className="pdf-control-divider" />
        <button type="button" className="pdf-fit-button" aria-pressed={fitMode === 'page' && zoom === 1} onClick={() => applyFitMode('page')}>Fit page</button>
        <button type="button" className="pdf-fit-button" aria-pressed={fitMode === 'width' && zoom === 1} onClick={() => applyFitMode('width')}>Fit width</button>
        <button type="button" className="pdf-fit-button" aria-pressed={fitMode === 'actual' && zoom === 1} onClick={() => applyFitMode('actual')}>100%</button>
        <button type="button" className="icon-button" aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'} title={isFullscreen ? 'Exit full screen' : 'Full screen'} onClick={toggleFullscreen}>{isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
        <span className="pdf-control-divider" />
        <button type="button" className="icon-button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => navigateToPage(currentPage - 1)}><ChevronLeft size={18} /></button>
        <label className="flex items-center gap-1 text-[11px] text-muted"><input className="pdf-page-input" aria-label="Page number" type="number" min="1" max={pageCount || 1} value={pageInput} onChange={(event) => setPageInput(event.target.value)} onBlur={() => navigateToPage(pageInput)} onKeyDown={(event) => event.key === 'Enter' && navigateToPage(pageInput)} /> / {pageCount || '—'}</label>
        <button type="button" className="icon-button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => navigateToPage(currentPage + 1)}><ChevronRight size={18} /></button>
      </div>
      <button type="button" className="pdf-close-button" aria-label="Close PDF viewer" title="Close PDF viewer" onClick={onClose}><X size={17} /><span>Close</span></button>
    </header>
    {canSummarize && <div className="pdf-viewer-ai-bar">
      <button type="button" className="pdf-ai-button" onClick={generateSummary} disabled={summaryLoading}>
        {summaryLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {summaryLoading ? 'Summarizing PDF…' : 'Summarize with Gemini AI'}
      </button>
      {summary && <button type="button" className="pdf-summary-toggle" onClick={() => setSummaryOpen((open) => !open)}>{summaryOpen ? 'Hide summary' : 'Show summary'}</button>}
    </div>}
    <div className={`pdf-viewer-content${summaryOpen ? ' pdf-viewer-content-with-summary' : ''}`}>
      <div className="pdf-viewer-scroll" ref={viewerRef} onScroll={updateCurrentPage}>
        {loading && <div className="pdf-viewer-message"><LoaderCircle className="animate-spin" size={23} /><span>Loading PDF...</span></div>}
        {error && <div className="pdf-viewer-message form-error" role="alert">{error}</div>}
        {pageCount > 0 && Array.from({ length: pageCount }, (_, index) => {
          const pageNumber = index + 1
          const dimensions = pageDimensions[pageNumber]
          const pageScale = dimensions && viewerSize.width && viewerSize.height
            ? getPdfPageScale(dimensions, viewerSize, fitMode, zoom)
            : 0
          return <div className="pdf-viewer-page" key={pageNumber} data-page={pageNumber} style={{ aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : undefined, ...(pageScale ? { width: `${dimensions.width * pageScale}px` } : {}) }}><canvas data-page={pageNumber} aria-label={`PDF page ${pageNumber}`} /></div>
        })}
      </div>
      {summaryOpen && <aside className="pdf-summary-panel" aria-label="Gemini AI PDF summary">
        <div className="pdf-summary-header">
          <div className="min-w-0"><h2 className="text-sm font-semibold">PDF summary</h2><p className="mt-1 text-[10px] text-muted">Generated from this document with Gemini AI</p></div>
          <div className="flex shrink-0 gap-1">
            {summary && <><button type="button" className="pdf-summary-action" onClick={copySummary}>{summaryCopied ? <Check size={14} /> : <Copy size={14} />} {summaryCopied ? 'Copied' : 'Copy'}</button><button type="button" className="pdf-summary-action" onClick={downloadSummary}><Download size={14} /> Download</button></>}
            <button type="button" className="icon-button" aria-label="Hide summary" onClick={() => setSummaryOpen(false)}><X size={16} /></button>
          </div>
        </div>
        {summaryLoading && <div className="pdf-summary-status"><LoaderCircle size={19} className="animate-spin" /><span>Reading the PDF and preparing study notes… This may take a little while.</span></div>}
        {summaryError && <p className="pdf-summary-error" role="alert">{summaryError}</p>}
        {summary && <div className="pdf-summary-body"><SummaryContent text={summary} /></div>}
        {!summary && !summaryLoading && !summaryError && <p className="pdf-summary-status">Choose “Summarize with Gemini AI” to generate revision notes from this PDF.</p>}
      </aside>}
    </div>
  </div>
}

function youtubeEmbedUrl(value) {
  try {
    const url = new URL(value)
    if (url.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`
    if (['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      const videoId = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : ''
      return videoId ? `https://www.youtube-nocookie.com/embed/${videoId}` : ''
    }
  } catch {
    return ''
  }
  return ''
}

export function StudentDashboard() {
  const { user, database } = useApp()
  const myIssues = database.issues.filter((issue) => issue.studentId === user.id)
  const active = myIssues.filter((issue) => issue.status === 'issued')
  const overdue = active.filter((issue) => dayDifference(issue.dueDate) < 0)
  const recent = [...myIssues].sort((a, b) => activityDate(b).localeCompare(activityDate(a))).slice(0, 3)
  const bookById = (id) => database.books.find((book) => book.id === id)

  return <>
    <PageHeader eyebrow="Your library" title={`Good day, ${user.name.split(' ')[0]}.`} description="A little time with a book can take you anywhere. Here's what's happening in your library." />
    <section className="card mb-6 grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
      <div><p className="mb-2 text-[10px] font-bold uppercase tracking-[.15em] text-forest">Student profile</p><p className="font-display text-base font-semibold">{user.name}</p><p className="mt-1 text-xs text-muted">{user.usn} · {user.department}{user.semester ? ` · Semester ${user.semester}` : ''}</p></div>
      <div className="sm:border-l sm:border-[#edf0ec] sm:pl-5"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-forest">Contact</p><p className="mt-2 text-xs text-muted">{user.email}</p>{user.mobile && <p className="mt-1 text-xs text-muted">{user.mobile}</p>}</div>
    </section>
    <section className="welcome-banner mb-6">
      <div className="relative z-10 max-w-xl">
        <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.17em] text-white/65"><Sparkles size={13} /> A good day to read</p>
        <h2 className="font-display text-2xl font-semibold leading-tight tracking-[-.03em] text-white sm:text-[30px]">Make room for a new idea.</h2>
        <p className="mt-2 max-w-md text-xs leading-5 text-white/70">Discover books picked for curious minds and find your next favorite page.</p>
        <Link to="/student/books" className="banner-link mt-5">Explore the collection <ArrowRight size={15} /></Link>
      </div>
      <div className="banner-illustration hidden sm:block"><BookOpen size={84} strokeWidth={1} /><span>Read<br />a little</span></div>
    </section>
    {database.notifications.length > 0 && <section className="card mt-5 overflow-hidden">
      <div className="border-b border-[#edf0ec] px-5 py-4 sm:px-6"><h2 className="font-display text-base font-semibold">Library updates</h2></div>
      <div className="divide-y divide-[#edf0ec]">{database.notifications.slice(0, 10).map((notification) => <div key={notification.id} className="flex items-start gap-3 px-5 py-3 sm:px-6">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? 'bg-[#d5ddd7]' : notification.type === 'overdue' ? 'bg-red-600' : 'bg-forest'}`} />
        <div><p className="text-xs text-muted">{notification.message}</p>{notification.type === 'due_soon' || notification.type === 'overdue' ? <p className={`mt-1 text-[9px] font-bold uppercase tracking-[.12em] ${notification.type === 'overdue' ? 'text-red-600' : 'text-forest'}`}>{notification.type === 'overdue' ? 'Overdue' : 'Due soon'}</p> : null}</div>
      </div>)}</div>
    </section>}
    {database.favourites.length > 0 && <section className="card mt-5 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-4 sm:px-6"><h2 className="font-display text-base font-semibold">Saved books</h2><Link to="/student/books" className="subtle-link">Browse collection <ArrowRight size={14} /></Link></div>
      <div className="divide-y divide-[#edf0ec]">{database.books.filter((book) => database.favourites.includes(book.id)).slice(0, 4).map((book) => <div key={book.id} className="flex items-center gap-3 px-5 py-3 sm:px-6"><div className="book-cover cover-small"><BookOpen size={16} /></div><div><p className="text-xs font-semibold">{book.title}</p><p className="mt-1 text-[10px] text-muted">{book.author}</p></div></div>)}</div>
    </section>}
    <div className="mb-7 grid gap-3 sm:grid-cols-3">
      <StatCard label="Currently borrowed" value={active.length} note="books checked out to you" icon={Bookmark} />
      <StatCard label="Due soon" value={active.filter((issue) => dayDifference(issue.dueDate) >= 0 && dayDifference(issue.dueDate) <= 3).length} note="within the next 3 days" icon={Clock3} tint="lime" />
      <StatCard label="Overdue" value={overdue.length} note={overdue.length ? 'Please return when you can' : 'You’re all caught up'} icon={CalendarDays} tint={overdue.length ? 'rose' : 'blue'} />
    </div>
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#edf0ec] px-5 py-5 sm:px-6">
        <div><h2 className="font-display text-base font-semibold">Recently borrowed</h2><p className="mt-1 text-[11px] text-muted">Your latest library activity</p></div>
        <Link to="/student/my-books" className="subtle-link">View all <ArrowRight size={14} /></Link>
      </div>
      {recent.length ? <div className="divide-y divide-[#f0f2ef]">
        {recent.map((issue) => {
          const book = bookById(issue.bookId)
          return <div key={issue.id} className="flex items-center gap-3 px-5 py-4 sm:px-6">
            <div className="book-cover cover-small"><BookOpen size={17} /></div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{book?.title ?? 'Removed book'}</p><p className="mt-1 text-[10px] text-muted">{issue.status === 'requested' ? `Requested ${dateLabel(issue.issueDate)}` : issue.status === 'rejected' ? `Request declined · ${dateLabel(issue.issueDate)}` : issue.status === 'returned' ? `Returned ${dateLabel(issue.returnDate)}` : `Issued ${dateLabel(issue.issueDate)} · Due ${dateLabel(issue.dueDate)}`}</p></div>
            {issue.status === 'requested' ? <Badge tone="blue">Awaiting approval</Badge> : issue.status === 'issued' ? <Badge tone={dayDifference(issue.dueDate) < 0 ? 'danger' : 'success'}>{dayDifference(issue.dueDate) < 0 ? 'Overdue' : 'Due ' + dateLabel(issue.dueDate)}</Badge> : <Badge tone="neutral">{issue.status === 'rejected' ? 'Declined' : 'Returned'}</Badge>}
          </div>
        })}
      </div> : <div className="p-5"><EmptyState title="Your reading journey starts here" description="Browse the collection and borrow a book to see your activity here." icon={BookOpen} action={<Link className="subtle-link" to="/student/books">Browse books <ArrowRight size={14} /></Link>} /></div>}
    </section>
  </>
}

export function BooksCatalog() {
  const { database, refresh, notify } = useApp()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All categories')
  const [subject, setSubject] = useState('All subjects')
  const [collection, setCollection] = useState('All collections')
  const categories = ['All categories', ...new Set(database.books.map((book) => book.category).filter(Boolean))]
  const subjects = ['All subjects', ...new Set(database.books.map((book) => book.subject).filter(Boolean))]
  const collections = ['All collections', ...new Set(database.books.map((book) => book.collection).filter(Boolean))]
  const visible = database.books.filter((book) => {
    const query = search.toLowerCase().trim()
    return (!query || `${book.title} ${book.author} ${book.subject} ${book.isbn} ${book.keywords}`.toLowerCase().includes(query))
      && (category === 'All categories' || book.category === category)
      && (subject === 'All subjects' || book.subject === subject)
      && (collection === 'All collections' || book.collection === collection)
  })

  async function requestBook(book) {
    try {
      await api.requestBook(book.id)
      await refresh()
      notify('Borrow request sent to the librarian.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }
  async function toggleFavourite(book) {
    const saved = database.favourites.includes(book.id)
    try {
      await api.setFavourite(book.id, !saved)
      await refresh()
      notify(saved ? 'Book removed from saved titles.' : 'Book saved to your favourites.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  return <>
    <PageHeader eyebrow="The collection" title="Find your next read." description="Browse books from across our shelves, from practical guides to big, beautiful ideas." />
    <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(150px,210px))]">
      <SearchBox value={search} onChange={setSearch} placeholder="Search title, author, subject, ISBN..." />
      <select className="select-control" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category">{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Filter by subject">{subjects.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" value={collection} onChange={(event) => setCollection(event.target.value)} aria-label="Filter by collection">{collections.map((item) => <option key={item}>{item}</option>)}</select>
      <span className="self-center text-xs text-muted sm:ml-auto">{visible.length} {visible.length === 1 ? 'book' : 'books'}</span>
    </div>
    {visible.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((book, index) => {
        const currentRequest = database.issues.find((issue) => issue.bookId === book.id && ['requested', 'issued'].includes(issue.status))
        const canRequest = book.availableCopies > 0 && !['Unavailable', 'Reserved'].includes(book.status)
        const saved = database.favourites.includes(book.id)
        return <article key={book.id} className="book-card card p-5 sm:p-6">
        <div className="mb-5 flex items-start justify-between">
          <div className={`book-cover cover-${index % 5} overflow-hidden`}>{book.coverImage ? <img className="h-full w-full object-contain" src={book.coverImage} alt={`${book.title} cover`} /> : <BookOpen size={24} strokeWidth={1.5} />}</div>
          <div className="flex items-center gap-2"><Badge tone={book.availableCopies > 0 && book.status !== 'Unavailable' ? 'success' : 'danger'}>{book.status === 'Unavailable' ? 'Unavailable' : book.availableCopies > 0 ? book.status || 'Available' : 'Checked out'}</Badge><button type="button" className="icon-button" title={saved ? 'Remove from favourites' : 'Save to favourites'} aria-label={saved ? 'Remove from favourites' : 'Save to favourites'} onClick={() => toggleFavourite(book)}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button></div>
        </div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[.14em] text-forest">{book.category}</p>
        <h2 className="font-display text-[17px] font-semibold leading-snug tracking-[-.02em]">{book.title}</h2>
        <p className="mt-1 text-xs text-muted">by {book.author}</p>
        {book.subject && <p className="mt-2 text-[10px] text-muted">{book.subject}{book.department ? ` · ${book.department}` : ''}</p>}
        <div className="mt-5 flex items-center justify-between border-t border-[#edf0ec] pt-4 text-[10px]">
          <span className="text-muted">ISBN <span className="font-medium text-ink">{book.isbn}</span></span>
          <span className="font-semibold text-forest">{book.availableCopies} of {book.totalCopies} available</span>
        </div>
        <details className="mt-4 border-t border-[#edf0ec] pt-3 text-xs">
          <summary className="cursor-pointer font-semibold text-forest">Book details</summary>
          <div className="mt-3 space-y-2 text-[10px] leading-5 text-muted">
            {book.description && <p>{book.description}</p>}
            <p>{[book.publisher, book.edition, book.publicationYear].filter(Boolean).join(' · ') || 'Publication details not provided'}</p>
            <p>{[book.collection, book.language, book.pages ? `${book.pages} pages` : ''].filter(Boolean).join(' · ')}</p>
            <p>Access: {book.accessStatus || 'Open Access'}{book.keywords ? ` · Tags: ${book.keywords}` : ''}</p>
            {(book.accessionNumber || book.rackNumber || book.shelfNumber) && <p>Location: {[book.accessionNumber && `Accession ${book.accessionNumber}`, book.rackNumber && `Rack ${book.rackNumber}`, book.shelfNumber && `Shelf ${book.shelfNumber}`].filter(Boolean).join(' · ')}</p>}
          </div>
        </details>
        <Button className="mt-4 w-full" variant={currentRequest ? 'secondary' : 'primary'} disabled={Boolean(currentRequest) || !canRequest} onClick={() => requestBook(book)}>
          {currentRequest?.status === 'issued' ? 'Already borrowed' : currentRequest ? 'Request pending' : canRequest ? 'Request this book' : 'Currently unavailable'}
        </Button>
        </article>
      })}
    </div> : <EmptyState title="No books found" description="Try a different title, author or category." icon={Search} />}
  </>
}

export function DigitalSearchPage() {
  const { database } = useApp()
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ author: 'All authors', subject: 'All subjects', department: 'All departments', category: 'All categories', year: 'All years', type: 'All types' })
  const books = database.books.map((book) => ({ ...book, resultType: 'book', resourceUrl: '' }))
  const resources = database.resources.map((resource) => ({ ...resource, resultType: resource.type, resourceUrl: resource.filePath ? api.resourceFileUrl(resource.filePath) : resource.url ?? '' }))
  const results = [...books, ...resources]
  const values = (field, allLabel) => [allLabel, ...new Set(results.map((result) => result[field]).filter(Boolean))]
  const authors = values('author', 'All authors')
  const subjects = values('subject', 'All subjects')
  const departments = values('department', 'All departments')
  const categories = values('category', 'All categories')
  const years = ['All years', ...new Set(results.map((result) => result.publicationYear || result.year).filter(Boolean))].sort((a, b) => a.startsWith('All ') ? -1 : b.startsWith('All ') ? 1 : Number(b) - Number(a))
  const types = ['All types', 'book', ...new Set(resources.map((resource) => resource.type).filter(Boolean))]
  const filtered = results.filter((result) => {
    const text = `${result.title} ${result.author} ${result.subject} ${result.department} ${result.category} ${result.description} ${result.isbn} ${result.keywords}`.toLowerCase()
    return (!query.trim() || text.includes(query.toLowerCase().trim()))
      && (filters.author === 'All authors' || result.author === filters.author)
      && (filters.subject === 'All subjects' || result.subject === filters.subject)
      && (filters.department === 'All departments' || result.department === filters.department)
      && (filters.category === 'All categories' || result.category === filters.category)
      && (filters.year === 'All years' || String(result.publicationYear || result.year) === filters.year)
      && (filters.type === 'All types' || result.resultType === filters.type)
  })

  return <>
    <PageHeader eyebrow="Digital library" title="Search everything." description="Explore physical books, documents, presentations, videos, and learning links in one place." />
    <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      <SearchBox value={query} onChange={setQuery} placeholder="Search titles, authors, ISBN, subjects..." />
      <select className="select-control" aria-label="Filter by author" value={filters.author} onChange={(event) => setFilters({ ...filters, author: event.target.value })}>{authors.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Filter by subject" value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })}>{subjects.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Filter by department" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}>{departments.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Filter by category" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Filter by year" value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}>{years.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Filter by resource type" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>{types.map((item) => <option key={item} value={item}>{item === 'All types' ? item : item === 'book' ? 'Books' : resourceTypes[item] ?? item}</option>)}</select>
    </div>
    <p className="mb-4 text-xs text-muted">{filtered.length} results</p>
    {filtered.length ? <div className="divide-y divide-[#edf0ec] overflow-hidden rounded-xl border border-[#e9eee9] bg-white">
      {filtered.map((result) => <article key={`${result.resultType}-${result.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={result.resultType === 'book' ? 'success' : 'blue'}>{result.resultType === 'book' ? 'Book' : resourceTypes[result.resultType] ?? result.resultType}</Badge>{result.isbn && <span className="text-[10px] text-muted">ISBN {result.isbn}</span>}</div><h2 className="font-display text-base font-semibold">{result.title}</h2><p className="mt-1 text-xs text-muted">{[result.author, result.subject, result.department, result.category, result.publicationYear || result.year].filter(Boolean).join(' · ')}</p>{result.description && <p className="mt-2 text-xs leading-5 text-muted">{result.description}</p>}{result.resultType === 'book' && <p className="mt-2 text-[10px] font-semibold text-forest">{result.availableCopies} of {result.totalCopies} copies available</p>}</div>
        {result.resultType === 'book' ? <Link className="subtle-link shrink-0" to="/student/books">View book <ArrowRight size={14} /></Link> : <a className="subtle-link shrink-0" href={result.resourceUrl} target="_blank" rel="noreferrer">Open resource <ArrowRight size={14} /></a>}
      </article>)}
    </div> : <EmptyState title="No matching resources" description="Try another search or clear one of the filters." icon={Search} />}
  </>
}

export function MyBooks() {
  const { user, database } = useApp()
  const myIssues = database.issues.filter((issue) => issue.studentId === user.id).sort((a, b) => activityDate(b).localeCompare(activityDate(a)))
  const active = myIssues.filter((issue) => issue.status === 'issued')

  return <>
    <PageHeader eyebrow="Your shelf" title="My books." description="Keep an eye on your current reads, due dates and return history." />
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <StatCard label="All-time loans" value={myIssues.length} icon={LibraryBig} />
      <StatCard label="Currently reading" value={active.length} icon={BookOpen} tint="lime" />
      <StatCard label="Returned" value={myIssues.filter((issue) => issue.status === 'returned').length} icon={Bookmark} tint="blue" />
    </div>
    {myIssues.length ? <div className="card overflow-hidden">
      <div className="border-b border-[#edf0ec] px-5 py-5 sm:px-6"><h2 className="font-display text-base font-semibold">Borrowing history</h2><p className="mt-1 text-[11px] text-muted">Your loan dates and current status</p></div>
      <div className="divide-y divide-[#edf0ec]">
        {myIssues.map((issue, index) => {
          const book = database.books.find((item) => item.id === issue.bookId)
          const days = dayDifference(issue.dueDate)
          const isLate = issue.status === 'issued' && days < 0
          return <div key={issue.id} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div className={`book-cover cover-${index % 5} h-14 w-12 shrink-0`}><BookOpen size={19} /></div>
            <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-semibold">{book?.title ?? 'Removed book'}</h3><p className="mt-1 text-xs text-muted">{book?.author ?? '—'}</p><p className="mt-2 text-[10px] text-muted">{issue.status === 'requested' ? `Requested ${dateLabel(issue.issueDate)} · awaiting librarian approval` : issue.status === 'rejected' ? `Requested ${dateLabel(issue.issueDate)} · request declined` : `Issued ${dateLabel(issue.issueDate)} · Due ${dateLabel(issue.dueDate)} · Returned ${dateLabel(issue.returnDate)}`}</p></div>
            <div className="flex items-center justify-between gap-4 sm:min-w-[180px] sm:justify-end">
              {issue.status === 'requested' ? <Badge tone="blue">Pending</Badge> : issue.status === 'returned' ? <Badge tone="neutral">Returned {dateLabel(issue.returnDate)}</Badge> : isLate ? <span className="text-xs font-semibold text-red-600">{Math.abs(days)} {Math.abs(days) === 1 ? 'day' : 'days'} overdue</span> : <span className="text-xs font-medium text-forest">{days === 0 ? 'Due today' : `${days} days remaining`}</span>}
              <Badge tone={issue.status === 'requested' ? 'blue' : issue.status === 'returned' || issue.status === 'rejected' ? 'neutral' : isLate ? 'danger' : 'success'}>{issue.status === 'requested' ? 'Requested' : issue.status === 'rejected' ? 'Declined' : issue.status === 'returned' ? 'Returned' : isLate ? 'Overdue' : 'Issued'}</Badge>
            </div>
          </div>
        })}
      </div>
    </div> : <EmptyState title="No books checked out yet" description="When you borrow a book, your dates and due reminders will live here." icon={BookOpen} action={<Link className="subtle-link" to="/student/books">Explore books <ArrowRight size={14} /></Link>} />}
  </>
}

export function AiSummarizerPage() {
  const { database } = useApp()
  const pdfResources = database.resources
    .filter((resource) => resource.availability !== 'Missing file'
      && (resource.resourceKind === 'pdf' || resource.resourceKind === 'document' && resource.fileType === 'pdf'))
    .sort((left, right) => left.title.localeCompare(right.title))
  const [selectedId, setSelectedId] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [resourceQuery, setResourceQuery] = useState('')
  const [summary, setSummary] = useState('')
  const [loadingId, setLoadingId] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const selectedResource = pdfResources.find((resource) => resource.id === selectedId)
  const filteredResources = pdfResources.filter((resource) =>
    `${resource.title} ${resource.subject}`.toLocaleLowerCase().includes(resourceQuery.trim().toLocaleLowerCase()),
  )
  const hasSource = Boolean(selectedResource || selectedFile)

  function selectResource(resource) {
    setSelectedId(resource.id)
    setSelectedFile(null)
    setSummary('')
    setError('')
    setCopied(false)
  }

  function selectFile(event) {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (file && !file.name.toLocaleLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file. Other file types are not supported.')
      return
    }
    if (file && file.size > 35 * 1024 * 1024) {
      setError('PDF files must be 35 MB or smaller.')
      return
    }
    setSelectedId('')
    setSelectedFile(file)
    setSummary('')
    setError('')
    setCopied(false)
  }

  async function generateSummary() {
    if (!hasSource || loadingId) return
    setSummary('')
    setError('')
    setCopied(false)
    setLoadingId('summary')
    try {
      const result = selectedFile
        ? await api.summarizeUploadedPdf(selectedFile)
        : await api.summarizeResource(selectedResource.resourceKind || selectedResource.type, selectedResource.id)
      setSummary(result.summary)
    } catch (summaryError) {
      setError(summaryError.message || 'The PDF could not be summarized. Please try again.')
    } finally {
      setLoadingId('')
    }
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary)
      setCopied(true)
      setError('')
    } catch {
      setError('Clipboard access is unavailable. Select and copy the summary text instead.')
    }
  }

  function downloadSummary() {
    const blob = new Blob([summary], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${String(selectedFile?.name || selectedResource?.title || 'PDF').replace(/[<>:"/\\|?*]/g, '_').split('').map((character) => character.charCodeAt(0) < 32 ? '_' : character).join('')}-summary.md`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <>
    <PageHeader
      eyebrow="AI study tools"
      title="Gemini PDF summarizer."
      description="Select an accessible PDF from your library or upload one as an alternative. Gemini creates clear explanations, key points, definitions, formulas, revision notes, exam questions, and chapter summaries."
    />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
      <section className="card overflow-hidden">
        <div className="border-b border-[#edf0ec] px-5 py-4">
          <h2 className="text-sm font-semibold">Select from Library Resources</h2>
          <p className="mt-1 text-[11px] text-muted">{pdfResources.length} accessible {pdfResources.length === 1 ? 'PDF' : 'PDFs'}</p>
        </div>
        <div className="space-y-3 p-5">
          <label htmlFor="library-pdf-search" className="block text-xs font-medium">Search by title or subject</label>
          <input
            id="library-pdf-search"
            type="search"
            value={resourceQuery}
            onChange={(event) => setResourceQuery(event.target.value)}
            placeholder="Search library PDFs"
            className="w-full rounded-lg border border-[#dfe7df] bg-white px-3 py-2 text-xs text-ink outline-none focus:border-forest"
          />
          <label htmlFor="library-pdf-select" className="block text-xs font-medium">Library PDF</label>
          <select
            id="library-pdf-select"
            value={selectedId}
            onChange={(event) => {
              const resource = pdfResources.find((item) => item.id === event.target.value)
              if (resource) selectResource(resource)
              else setSelectedId('')
            }}
            disabled={!filteredResources.length}
            className="w-full rounded-lg border border-[#dfe7df] bg-white px-3 py-2.5 text-xs text-ink outline-none focus:border-forest disabled:bg-[#f5f7f4]"
          >
            <option value="">{filteredResources.length ? 'Select a PDF from library resources' : 'No matching library PDFs'}</option>
            {filteredResources.map((resource) => (
              <option key={`${resource.resourceKind}:${resource.id}`} value={resource.id}>
                {resource.title} · {resource.subject || 'No subject'}
              </option>
            ))}
          </select>
          {selectedResource && <div className="rounded-xl bg-[#f5f8f4] p-3" aria-live="polite">
            <p className="text-xs font-semibold">{selectedResource.title}</p>
            <p className="mt-1 text-[11px] text-muted">Subject: {selectedResource.subject || 'Not specified'}</p>
            <a className="mt-2 inline-flex text-[10px] font-medium text-forest hover:underline" href={api.resourceFileUrl(selectedResource.previewPath || selectedResource.filePath)} target="_blank" rel="noreferrer">Open library PDF</a>
          </div>}
          {!pdfResources.length && <p className="text-xs leading-5 text-muted">No accessible uploaded PDFs are available. Upload a PDF below as an alternative.</p>}
        </div>
        <div className="border-t border-[#edf0ec] p-5">
          <label htmlFor="gemini-pdf-upload" className="mb-2 block text-xs font-semibold">Optional: Upload a PDF instead</label>
          <input id="gemini-pdf-upload" type="file" accept=".pdf,application/pdf" onChange={selectFile} className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-[#edf5ef] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-forest hover:file:bg-[#e1eee3]" />
          <p className="mt-2 text-[10px] leading-4 text-muted">PDF files only, up to 35 MB. Uploaded files are processed for this summary and not added to your library.</p>
          {selectedFile && <p className="mt-2 truncate text-[11px] font-medium text-forest" title={selectedFile.name}>{selectedFile.name}</p>}
        </div>
        <div className="border-t border-[#edf0ec] p-5">
          <button type="button" className="button button-primary w-full justify-center" onClick={generateSummary} disabled={!hasSource || Boolean(loadingId)}>
            {loadingId ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {loadingId ? 'Summarizing PDF…' : 'Summarize with Gemini AI'}
          </button>
        </div>
      </section>

      <section className="card min-h-64 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0ec] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{selectedFile?.name || selectedResource?.title || 'Your summary'}</h2>
            <p className="mt-1 text-[10px] text-muted">{hasSource ? 'Generated from the selected PDF with Gemini AI' : 'Choose a library PDF or upload a PDF to get started.'}</p>
          </div>
          {summary && <div className="flex shrink-0 gap-2">
            <button type="button" className="pdf-summary-action" onClick={copySummary}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}</button>
            <button type="button" className="pdf-summary-action" onClick={downloadSummary}><Download size={14} /> Download</button>
          </div>}
        </div>
        {loadingId && <div className="pdf-summary-status" role="status"><LoaderCircle size={20} className="animate-spin" /><span>Uploading and reading the PDF, then preparing study notes. This may take a little while.</span></div>}
        {error && <p className="pdf-summary-error" role="alert">{error}</p>}
        {summary && <div className="pdf-summary-body"><SummaryContent text={summary} /></div>}
        {!hasSource && !loadingId && !error && <p className="pdf-summary-status">Select a PDF or upload one, then choose “Summarize with Gemini AI”.</p>}
        {hasSource && !summary && !loadingId && !error && <p className="pdf-summary-status">Choose “Summarize with Gemini AI” to generate revision notes from this PDF.</p>}
      </section>
    </div>
  </>
}

export function ResourcesPage() {
  const { database, user, notify, setResourceFavourite, recordResourceActivity } = useApp()
  const [query, setQuery] = useState('')
  const [viewingPdf, setViewingPdf] = useState(null)
  const [reportingResource, setReportingResource] = useState(null)
  const [reportDetails, setReportDetails] = useState('')
  const [reportError, setReportError] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)
  const [filters, setFilters] = useState({ category: 'All sections', department: 'All departments', semester: 'All semesters', subject: 'All subjects', type: 'All types', year: 'All years' })
  const departments = ['All departments', ...new Set(database.resources.map((item) => item.department).filter(Boolean))]
  const semesters = ['All semesters', ...new Set(database.resources.map((item) => item.semester).filter(Boolean).sort((a, b) => Number(a) - Number(b)))]
  const subjects = ['All subjects', ...new Set(database.resources.map((item) => item.subject).filter(Boolean))]
  const types = ['All types', ...new Set(database.resources.map((item) => item.type))]
  const years = ['All years', ...new Set(database.resources.map((item) => item.examYear || item.year || item.uploadDate?.slice(0, 4)).filter(Boolean).map(String).sort((a, b) => b.localeCompare(a)))]
  const sections = [...new Set([...resourceCategories, ...database.resources.map((item) => item.category).filter(Boolean)])]
  const visible = useMemo(() => database.resources.filter((resource) =>
    (!query.trim() || `${resource.title} ${resource.author} ${resource.subject} ${resource.description} ${resource.category}`.toLowerCase().includes(query.toLowerCase().trim()))
    && (filters.category === 'All sections' || resource.category === filters.category)
    && (filters.department === 'All departments' || resource.department === filters.department)
    && (filters.semester === 'All semesters' || resource.semester === filters.semester)
    && (filters.subject === 'All subjects' || resource.subject === filters.subject)
    && (filters.type === 'All types' || resource.type === filters.type)
    && (filters.year === 'All years' || String(resource.examYear || resource.year || resource.uploadDate?.slice(0, 4) || '') === filters.year)
    && (!savedOnly || database.resourceFavourites.includes(`${resource.resourceKind || resource.type}:${resource.id}`)),
  ), [database.resources, database.resourceFavourites, filters, query, savedOnly])
  const recentResources = database.recentResources
    .map((activity) => ({ ...activity, resource: database.resources.find((resource) => resource.id === activity.resourceId && (resource.resourceKind || resource.type) === activity.resourceKind) }))
    .filter((activity) => activity.resource)
  const pdfPageChanged = useCallback((pageNumber, totalPages) => {
    if (viewingPdf) recordResourceActivity(viewingPdf, pageNumber, totalPages).catch((error) => notify(error.message, 'error'))
  }, [notify, recordResourceActivity, viewingPdf])

  function remember(resource) {
    recordResourceActivity(resource).catch((error) => notify(error.message, 'error'))
  }

  function openResource(resource) {
    remember(resource)
    if (resource.previewPath || ['pdf', 'question_bank', 'previous_paper'].includes(resource.type)) {
      setViewingPdf({ ...resource, filePath: resource.previewPath || resource.filePath })
    } else if (resource.url) {
      window.open(resource.url, '_blank', 'noopener,noreferrer')
    }
  }

  async function toggleSaved(resource) {
    const key = `${resource.resourceKind || resource.type}:${resource.id}`
    try {
      await setResourceFavourite(resource, !database.resourceFavourites.includes(key))
      notify(database.resourceFavourites.includes(key) ? 'Resource removed from saved items.' : 'Resource saved to your bookmarks.')
    } catch (error) {
      notify(error.message, 'error')
    }
  }

  async function reportIssue(event) {
    event.preventDefault()
    if (!reportingResource) return
    try {
      await api.reportResourceIssue(reportingResource.resourceKind || reportingResource.type, reportingResource.id, reportDetails)
      setReportingResource(null)
      setReportDetails('')
      setReportError('')
      notify('Thank you. The library team has been notified.')
    } catch (error) {
      setReportError(error.message)
    }
  }

  return <>
    <PageHeader eyebrow="Study corner" title="Resources for the curious." description="Find EEE learning materials, videos, papers, code and trusted learning links." action={user?.canManageResources && <Link className="button button-secondary" to="/student/manage-resources">Manage resources <ArrowRight size={14} /></Link>} />
    <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <SearchBox value={query} onChange={setQuery} placeholder="Search title, author or subject..." />
      <select className="select-control" aria-label="Library section" value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option>All sections</option>{sections.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Department" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}>{departments.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Semester" value={filters.semester} onChange={(event) => setFilters({ ...filters, semester: event.target.value })}>{semesters.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Subject" value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })}>{subjects.map((item) => <option key={item}>{item}</option>)}</select>
      <select className="select-control" aria-label="Resource type" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}>{types.map((item) => <option key={item} value={item}>{item === 'All types' ? item : resourceTypes[item] ?? item}</option>)}</select>
      <select className="select-control" aria-label="Year" value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value })}>{years.map((item) => <option key={item}>{item}</option>)}</select>
    </div>
    <section className="mb-7">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.15em] text-forest">Explore the collection</p><h2 className="mt-1 font-display text-lg font-semibold">Learning, organized by section</h2></div><button type="button" className={`button !min-h-9 !px-3 ${savedOnly ? 'button-primary' : 'button-secondary'}`} aria-pressed={savedOnly} onClick={() => setSavedOnly((current) => !current)}><Bookmark size={14} /> {savedOnly ? 'Showing saved' : 'Saved resources'}</button></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sections.map((section, index) => {
          const count = database.resources.filter((resource) => resource.category === section).length
          return <button key={section} type="button" className={`resource-section-card ${filters.category === section ? 'resource-section-card-active' : ''}`} onClick={() => setFilters({ ...filters, category: filters.category === section ? 'All sections' : section })}>
            <span className={`resource-icon ${index % 2 ? 'resource-icon-yellow' : ''}`}><BookOpen size={19} /></span>
            <span className="min-w-0 flex-1 text-left"><span className="block text-xs font-semibold leading-5 text-ink">{section}</span><span className="mt-1 block text-[10px] text-muted">{count} {count === 1 ? 'resource' : 'resources'}</span></span>
            <ArrowRight size={14} className="text-muted" />
          </button>
        })}
      </div>
    </section>
    {recentResources.length > 0 && <section className="mb-7">
      <div className="mb-3"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-forest">Your activity</p><h2 className="mt-1 font-display text-lg font-semibold">Recently accessed</h2></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{recentResources.slice(0, 6).map(({ resource, pageNumber, totalPages, resourceKey }) => {
        const progress = totalPages ? Math.round((pageNumber / totalPages) * 100) : null
        return <button key={resourceKey} type="button" className="card flex items-center gap-3 p-4 text-left transition hover:-translate-y-0.5" onClick={() => openResource(resource)}>
          <span className="resource-icon"><Clock3 size={17} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-ink">{resource.title}</span><span className="mt-1 block text-[10px] text-muted">{progress === null ? 'Recently opened' : `Page ${pageNumber} of ${totalPages} · ${progress}% read`}</span></span><ArrowRight size={14} className="shrink-0 text-muted" />
        </button>
      })}</div>
    </section>}
    <p className="mb-4 text-xs text-muted">{visible.length} {visible.length === 1 ? 'resource' : 'resources'} found</p>
    {visible.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((resource, index) => {
        const embedUrl = resource.type === 'video' ? youtubeEmbedUrl(resource.url) : ''
        const hasDocumentPreview = Boolean(resource.previewPath) || ['pdf', 'question_bank', 'previous_paper'].includes(resource.type)
        const resourceKey = `${resource.resourceKind || resource.type}:${resource.id}`
        const saved = database.resourceFavourites.includes(resourceKey)
        const activity = database.recentResources.find((item) => item.resourceKey === resourceKey)
        const progress = activity?.totalPages ? Math.round((activity.pageNumber / activity.totalPages) * 100) : null
        const downloadPath = resource.downloadPath || resource.filePath
        const downloadUrl = downloadPath?.startsWith('/api/')
          ? `${api.resourceFileUrl(downloadPath)}?download=1`
          : downloadPath
        return <article key={resource.id} className="card flex flex-col p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-2"><div className={`resource-icon ${index % 2 ? 'resource-icon-yellow' : ''}`}><BookOpen size={20} /></div><button type="button" className="icon-button" title={saved ? 'Remove resource bookmark' : 'Bookmark resource'} aria-label={saved ? 'Remove resource bookmark' : 'Bookmark resource'} aria-pressed={saved} onClick={() => toggleSaved(resource)}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'} /></button></div><Badge tone={hasDocumentPreview || ['pdf', 'question_bank', 'previous_paper'].includes(resource.type) ? 'success' : 'blue'}>{resourceTypes[resource.type] ?? resource.type}</Badge></div>
        {embedUrl && <iframe className="mb-4 aspect-video w-full rounded-lg border-0" src={embedUrl} title={resource.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />}
        <h2 className="font-display text-base font-semibold leading-snug">{resource.title}</h2>
        <p className="mt-2 text-xs text-muted">{resource.subject}{resource.semester ? ` · Semester ${resource.semester}` : ''}</p>
        <p className="mt-1 text-[10px] text-muted">{[resource.author, resource.category, resource.department, resource.year, resource.subjectCode, resource.scheme, resource.examYear && `Exam ${resource.examYear}`, resource.uploadDate && dateLabel(resource.uploadDate)].filter(Boolean).join(' · ')}</p>
        {resource.description && <p className="mt-3 text-xs leading-5 text-muted">{resource.description}</p>}
        {progress !== null && <div className="mt-4"><div className="mb-1 flex justify-between text-[10px] text-muted"><span>Reading progress</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#edf1ec]"><div className="h-full rounded-full bg-forest" style={{ width: `${progress}%` }} /></div></div>}
        {hasDocumentPreview ? <div className="resource-download mt-5"><button type="button" onClick={() => openResource(resource)}>View document</button><a href={downloadUrl} download onClick={() => remember(resource)}>Download original <Download size={15} /></a></div> : <a className="resource-download mt-5" href={resource.url} target="_blank" rel="noreferrer" onClick={() => remember(resource)}>{resource.type === 'video' ? embedUrl ? 'Open video source' : 'Watch video' : 'Visit resource'} <Download size={15} /></a>}
        <button type="button" className="mt-3 inline-flex w-fit items-center gap-1.5 text-[10px] font-medium text-muted hover:text-forest" onClick={() => { setReportingResource(resource); setReportDetails(''); setReportError('') }}><Flag size={12} /> Report a broken link</button>
      </article>
      })}
    </div> : <EmptyState title="No resources match those filters" description="Choose another library section, department, semester, subject, type or year." icon={Search} />}
    {viewingPdf && <PdfViewer resource={viewingPdf} onClose={() => setViewingPdf(null)} onPageChange={pdfPageChanged} />}
    {reportingResource && <Modal title="Report a resource issue" description={`Let the library team know if “${reportingResource.title}” is unavailable or incorrect.`} onClose={() => setReportingResource(null)}>
      <form className="space-y-4 p-5 sm:p-7" onSubmit={reportIssue}>
        <label className="field-label">What is wrong? (optional)<textarea className="input min-h-24 py-3" maxLength="300" value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} placeholder="The link does not open, or the file appears incorrect..." /></label>
        {reportError && <p className="form-error" role="alert">{reportError}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setReportingResource(null)}>Cancel</Button><Button type="submit">Send report <ArrowRight size={14} /></Button></div>
      </form>
    </Modal>}
  </>
}
