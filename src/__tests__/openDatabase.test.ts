import { open } from '@op-engineering/op-sqlite'
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest'

import openDB, { closeDB } from '../openDatabase'

vi.mock('@op-engineering/op-sqlite', () => ({ open: vi.fn() }))

const mockOpen = open as unknown as Mock

const makeConnection = () => ({ executeSync: vi.fn(), close: vi.fn() })

describe('openDB', () => {
  afterEach(() => {
    closeDB('test.sqlite')
    mockOpen.mockReset()
  })

  it('hands the connection to onOpen once it is configured', () => {
    const connection = makeConnection()
    mockOpen.mockReturnValue(connection)
    const onOpen = vi.fn(() => {
      expect(connection.executeSync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL')
    })

    const result = openDB({ name: 'test.sqlite', onOpen })

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(connection)
    expect(mockOpen).toHaveBeenCalledWith({ name: 'test.sqlite' })
    expect('db' in result && result.db).toBe(connection)
  })

  it('calls onOpen once for a database that is already open', () => {
    mockOpen.mockReturnValue(makeConnection())
    const onOpen = vi.fn()

    openDB({ name: 'test.sqlite', onOpen })
    openDB({ name: 'test.sqlite', onOpen })

    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('reports an error thrown by onOpen as a failed opening', () => {
    mockOpen.mockReturnValue(makeConnection())
    const failure = new Error('unknown pragma')

    const result = openDB({
      name: 'test.sqlite',
      onOpen: () => {
        throw failure
      }
    })

    expect(result).toEqual({ error: failure })
  })

  it('closes the connection and retries the next opening when onOpen throws', () => {
    const connection = makeConnection()
    mockOpen.mockReturnValue(connection)
    const onOpen = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('database is locked')
      })
      .mockImplementationOnce(() => {})

    const failed = openDB({ name: 'test.sqlite', onOpen })
    const retried = openDB({ name: 'test.sqlite', onOpen })

    expect('error' in failed).toBe(true)
    expect(connection.close).toHaveBeenCalledTimes(1)
    expect(mockOpen).toHaveBeenCalledTimes(2)
    expect('db' in retried && retried.db).toBe(connection)
  })
})
