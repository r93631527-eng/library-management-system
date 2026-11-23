import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from '../services/api'
import { AppContext } from './appContext'

const emptyDatabase = {
  users: [], books: [], issues: [], resources: [], notifications: [], favourites: [],
  resourceFavourites: [], recentResources: [], categories: [], subjects: [],
  hasLibrarian: false, canManageResources: false, pendingRequestCount: 0,
}

export function AppProvider({ children }) {
  const [database, setDatabase] = useState(emptyDatabase)
  const [user, setUser] = useState(null)
  const [toast, setToast] = useState(null)
  const [ready, setReady] = useState(false)
  const [apiError, setApiError] = useState('')
  const [theme, setTheme] = useState(() => window.localStorage.getItem('libraai-theme') === 'dark' ? 'dark' : 'light')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('libraai-theme', theme)
  }, [theme])

  const refresh = useCallback(async () => {
    const data = await api.getDatabase()
    setDatabase(data)
    setApiError('')
    return data
  }, [])
  useEffect(() => {
    let active = true
    Promise.all([api.getSession(), api.getDatabase()])
      .then(([session, data]) => {
        if (!active) return
        setUser(session)
        setDatabase(data)
        setApiError('')
      })
      .catch((error) => {
        if (!active) return
        if (error.status === 401) {
          setUser(null)
          setDatabase(emptyDatabase)
          setApiError('')
        } else {
          setApiError(error.message)
        }
      })
      .finally(() => {
        if (active) setReady(true)
      })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!user) return undefined
    let active = true
    let syncing = false
    const synchronize = async () => {
      if (syncing || document.visibilityState === 'hidden') return
      syncing = true
      try {
        const data = await api.getDatabase()
        if (active) {
          setDatabase(data)
          setApiError('')
        }
      } catch (error) {
        if (!active) return
        if (error.status === 401) {
          setUser(null)
          setDatabase(emptyDatabase)
          setApiError('')
        } else {
          setApiError(error.message)
        }
      } finally {
        syncing = false
      }
    }
    const interval = window.setInterval(synchronize, 5000)
    window.addEventListener('focus', synchronize)
    document.addEventListener('visibilitychange', synchronize)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('focus', synchronize)
      document.removeEventListener('visibilitychange', synchronize)
    }
  }, [user])
  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone, id: Date.now() })
    window.setTimeout(() => setToast(null), 3200)
  }, [])
  const signIn = useCallback(async (identifier, password, role) => {
    const { user: found } = await api.signIn(identifier, password, role)
    setUser(found)
    await refresh()
    return found
  }, [refresh])
  const register = useCallback(async (details) => {
    const { user: created } = await api.registerUser(details)
    setUser(created)
    await refresh()
    return created
  }, [refresh])
  const setupAdmin = useCallback(async (details) => {
    const { user: created } = await api.setupAdmin(details)
    setUser(created)
    await refresh()
    return created
  }, [refresh])
  const signOut = useCallback(async () => {
    await api.signOut().catch(() => undefined)
    setUser(null)
    await refresh().catch(() => setDatabase(emptyDatabase))
  }, [refresh])
  const toggleTheme = useCallback(() => setTheme((current) => current === 'dark' ? 'light' : 'dark'), [])
  const setResourceFavourite = useCallback(async (resource, saved) => {
    const resourceKind = resource.resourceKind || resource.type
    await api.setResourceFavourite(resourceKind, resource.id, saved)
    const resourceKey = `${resourceKind}:${resource.id}`
    setDatabase((current) => ({
      ...current,
      resourceFavourites: saved
        ? [...new Set([...current.resourceFavourites, resourceKey])]
        : current.resourceFavourites.filter((key) => key !== resourceKey),
    }))
  }, [])
  const recordResourceActivity = useCallback(async (resource, pageNumber = 1, totalPages = null) => {
    const resourceKind = resource.resourceKind || resource.type
    const entry = await api.recordResourceActivity(resourceKind, resource.id, pageNumber, totalPages)
    setDatabase((current) => ({
      ...current,
      recentResources: [
        { ...entry, lastAccessedAt: new Date().toISOString() },
        ...current.recentResources.filter((item) => item.resourceKey !== entry.resourceKey),
      ].slice(0, 12),
    }))
  }, [])

  const value = useMemo(() => ({
    database, refresh, user, signIn, register, setupAdmin, signOut, toast, notify, ready, apiError,
    theme, toggleTheme, setResourceFavourite, recordResourceActivity,
  }), [database, refresh, user, signIn, register, setupAdmin, signOut, toast, notify, ready, apiError, theme, toggleTheme, setResourceFavourite, recordResourceActivity])
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
