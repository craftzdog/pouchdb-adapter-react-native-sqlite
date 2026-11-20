import { open } from '@op-engineering/op-sqlite'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'

import SqlPouchCore from '../core'

vi.mock('@op-engineering/op-sqlite', () => ({ open: vi.fn() }))

const mockOpen = open as unknown as Mock

const makeConnection = () => ({
  executeSync: vi.fn(),
  execute: vi.fn(() => Promise.resolve({ rows: [] })),
  transaction: vi.fn(() => new Promise(() => {})),
  close: vi.fn(),
  getDbPath: vi.fn(() => 'mydb.sqlite')
})

const createPouch = (name: string) => {
  const api: any = {}
  SqlPouchCore.call(api, { name }, () => {})
  return api
}

const closePouch = (api: any) => new Promise<void>(resolve => api._close(() => resolve()))

describe('_close', () => {
  afterEach(() => mockOpen.mockReset())

  it('closes the op-sqlite connection', async () => {
    const connection = makeConnection()
    mockOpen.mockReturnValue(connection)

    await closePouch(createPouch('mydb'))

    expect(connection.close).toHaveBeenCalledTimes(1)
  })

  it('opens a new connection when the database is opened again', async () => {
    mockOpen.mockImplementation(makeConnection)

    await closePouch(createPouch('reopened'))
    await closePouch(createPouch('reopened'))

    expect(mockOpen).toHaveBeenCalledTimes(2)
  })

  it('keeps the connection open while another instance of the database is open', async () => {
    const connection = makeConnection()
    mockOpen.mockReturnValue(connection)
    const first = createPouch('shared')
    const second = createPouch('shared')

    await closePouch(first)
    expect(connection.close).not.toHaveBeenCalled()

    await closePouch(second)
    expect(connection.close).toHaveBeenCalledTimes(1)
  })
})
