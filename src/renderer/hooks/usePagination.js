import { useState } from 'react'

export default function usePagination(items, filters) {
  const key = JSON.stringify(filters)
  const [selection, setSelection] = useState({ key, page: 1 })
  const pageCount = Math.max(1, Math.ceil(items.length / 15))
  const page = selection.key === key ? Math.min(selection.page, pageCount) : 1
  const setPage = next => setSelection({ key, page: Math.max(1, Math.min(next, pageCount)) })
  return { page, pageCount, setPage, total: items.length, items: items.slice((page - 1) * 15, page * 15) }
}
